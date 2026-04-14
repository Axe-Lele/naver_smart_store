// File: packages/infrastructure-playwright/src/session/playwright-session-gateway.adapter.ts
import type {
  PrepareLoginSessionCommand,
  SessionGatewayPort,
  ValidateLoginSessionQuery,
} from '@smart-store/application';
import { LoginSession } from '@smart-store/core';

import { SelectorProfileRegistry } from '../config/selector-profile.registry.js';
import {
  ManualLoginTimeoutError,
  ManualLoginWindowClosedError,
  type SessionProbeResult,
} from '../errors/playwright-infrastructure.error.js';
import { PlaywrightBrowserSessionAdapter } from './playwright-browser-session.adapter.js';
import { SessionHealthMonitor } from './session-health-monitor.js';
import { FileStorageStateRepository } from './storage-state.repository.js';
import { sleep } from '../utils/time.js';

export interface PlaywrightSessionGatewayAdapterOptions {
  manualLoginTimeoutMs?: number;
}

export class PlaywrightSessionGatewayAdapter implements SessionGatewayPort {
  private readonly manualLoginTimeoutMs: number;

  constructor(
    private readonly browserSessionAdapter = new PlaywrightBrowserSessionAdapter(),
    private readonly storageStateRepository = new FileStorageStateRepository(),
    private readonly selectorProfiles = new SelectorProfileRegistry(),
    options: PlaywrightSessionGatewayAdapterOptions = {},
  ) {
    this.manualLoginTimeoutMs = options.manualLoginTimeoutMs ?? 10 * 60_000;
  }

  async prepareManualSession(command: PrepareLoginSessionCommand): Promise<LoginSession> {
    const selectorProfile = await this.selectorProfiles.getResolved({
      profileId: command.settings.selectorProfileId,
      selectorConfigPath: command.settings.selectorConfigPath,
    });
    const monitor = new SessionHealthMonitor(selectorProfile);
    const browserSession = await this.browserSessionAdapter.openForManualLogin(
      command.settings,
    );

    try {
      try {
        await browserSession.page.goto(command.settings.productsUrl, {
          waitUntil: 'domcontentloaded',
        });
      } catch (error) {
        if (browserSession.isClosed()) {
          throw this.createManualLoginWindowClosedError(
            command.settings.storageStatePath,
            null,
          );
        }

        throw error;
      }

      return await this.captureManualSession({
        browserSession,
        command,
        monitor,
        expectedSelectors: [
          ...selectorProfile.productList.searchInput,
          ...selectorProfile.productList.pageIdentity,
        ],
      });
    } finally {
      await browserSession.close().catch(() => undefined);
    }
  }

  async validateSession(query: ValidateLoginSessionQuery): Promise<LoginSession> {
    const selectorProfile = await this.selectorProfiles.getResolved({
      profileId: query.settings.selectorProfileId,
      selectorConfigPath: query.settings.selectorConfigPath,
    });
    const browserSession = await this.browserSessionAdapter.openForAutomation(
      query.settings,
    );
    const monitor = new SessionHealthMonitor(selectorProfile);

    try {
      await monitor.assertAuthenticated(browserSession.page, {
        landingUrl: query.settings.productsUrl,
        expectedPageName: 'Smart Store product list',
        expectedSelectors: [
          ...selectorProfile.productList.searchInput,
          ...selectorProfile.productList.pageIdentity,
        ],
        storageStatePath: query.settings.storageStatePath,
      });

      const savedSession = await this.storageStateRepository.save(
        browserSession.context,
        query.settings.storageStatePath,
      );

      return savedSession.markValidated();
    } finally {
      await browserSession.close();
    }
  }

  private async captureManualSession(input: {
    browserSession: Awaited<
      ReturnType<PlaywrightBrowserSessionAdapter['openForManualLogin']>
    >;
    command: PrepareLoginSessionCommand;
    monitor: SessionHealthMonitor;
    expectedSelectors: readonly string[];
  }): Promise<LoginSession> {
    const deadline = Date.now() + this.manualLoginTimeoutMs;
    let lastProbe: SessionProbeResult | null = null;

    while (Date.now() < deadline) {
      if (input.browserSession.isClosed()) {
        throw this.createManualLoginWindowClosedError(
          input.command.settings.storageStatePath,
          lastProbe,
        );
      }

      try {
        const probe = await input.monitor.probe(input.browserSession.page, {
          expectedPageName: 'Smart Store product list',
          expectedSelectors: input.expectedSelectors,
          storageStatePath: input.command.settings.storageStatePath,
        });

        lastProbe = probe;

        if (probe.status === 'AUTHENTICATED') {
          return await this.storageStateRepository.save(
            input.browserSession.context,
            input.command.settings.storageStatePath,
          );
        }
      } catch (error) {
        if (input.browserSession.isClosed()) {
          throw this.createManualLoginWindowClosedError(
            input.command.settings.storageStatePath,
            lastProbe,
          );
        }

        if (error instanceof ManualLoginWindowClosedError) {
          throw error;
        }
      }

      await Promise.race([
        sleep(250),
        input.browserSession.waitForClose(),
      ]);
    }

    const timedOutSession = LoginSession.create({
      storageStatePath: input.command.settings.storageStatePath,
      status: lastProbe?.loginSessionStatus ?? 'LOGIN_REQUIRED',
      lastErrorMessage: lastProbe?.detail,
    });

    throw new ManualLoginTimeoutError(
      [
        '로그인 완료가 확인되기 전에 시간이 초과되었습니다.',
        '브라우저 창을 닫지 말고 스마트스토어 상품 목록 화면이 보일 때까지 기다려 주세요.',
        lastProbe ? `마지막 감지 상태: ${lastProbe.detail}` : '마지막 감지 상태: 확인되지 않음.',
        '복구: "로그인 준비 시작" 또는 "npm run login:prepare"를 다시 실행하세요.',
      ].join('\n'),
      timedOutSession,
    );
  }

  private createManualLoginWindowClosedError(
    storageStatePath: string,
    lastProbe: SessionProbeResult | null,
  ): ManualLoginWindowClosedError {
    const session = LoginSession.create({
      storageStatePath,
      status: lastProbe?.loginSessionStatus ?? 'INVALID',
      lastErrorMessage:
        lastProbe?.detail ??
        'The login browser window was closed before storageState could be saved.',
    });

    return new ManualLoginWindowClosedError(
      [
        '로그인 브라우저 창이 세션 저장 전에 닫혔습니다.',
        '이제는 로그인 완료를 감지하면 앱이 storageState를 먼저 저장하고 창을 정리합니다.',
        '로그인 후 창을 직접 닫지 말고 자동으로 닫힐 때까지 잠시 기다려 주세요.',
        '복구: "로그인 준비 시작" 또는 "npm run login:prepare"를 다시 실행하세요.',
      ].join('\n'),
      session,
    );
  }
}

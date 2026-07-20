// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DateResolverPort,
  SellerCenterPageGatewayPort,
  SelectorRegistryPort,
} from '../../apps/chrome-extension/src/application/ports.js';
import { ProductId, ProductProcessingState } from '../../apps/chrome-extension/src/domain/index.js';
import { ProductEditPageDriver } from '../../apps/chrome-extension/src/infrastructure/product-edit-page.driver.js';
import { WaitStrategy } from '../../apps/chrome-extension/src/infrastructure/wait-strategy.js';

describe('ProductEditPageDriver', () => {
  beforeEach(() => {
    vi.spyOn(WaitStrategy.prototype, 'waitForReady').mockResolvedValue();
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([]);
  });

  it('stops after selecting preorder in the temporary step mode for a normal product', async () => {
    renderEditor({ preorderChecked: false, normalChecked: true });
    const saveHandler = vi.fn();
    document.querySelector('#saveButton')?.addEventListener('click', saveHandler);

    const driver = createDriver();
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('예약구매 설정함');
      expect(result.message).toContain('주문기간 시작 달력을 열었습니다');
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
      expect(result.message).toContain('주문기간 종료 달력을 열었습니다');
      expect(result.message).toContain('오른쪽 이중 화살표를 정확히 1번 눌렀습니다');
      expect(result.message).toContain('1년 뒤 오늘 날짜를 정중앙으로 눌렀습니다');
      expect(result.message).toContain('가장 늦은 시간까지 선택했습니다');
      expect(result.message).toContain('판매 상태를 판매 중으로 선택했습니다');
      expect(result.message).toContain('발송완료일 달력을 열었습니다');
      expect(result.message).toContain('발송완료일 달력의 오른쪽 이중 화살표를 정중앙으로 정확히 1번 눌렀습니다');
      expect(result.message).toContain('오른쪽 한 개 화살표를 400ms 간격으로 정확히 3번 눌렀습니다');
      expect(result.message).toContain('선택 가능한 가장 마지막 날짜를 정중앙으로 눌렀습니다');
      expect(result.message).toMatch(/옵션 섹션( 아래 화살표 버튼을 클릭했습니다|이 이미 펼쳐져 있습니다)/);
      expect(result.message).toContain('선택형 설정함 버튼을 클릭했습니다');
      expect(result.message).toContain('단독형 라디오 버튼을 정중앙으로 클릭했습니다');
      expect(result.message).toContain('옵션명 입력칸을 클릭하고 필수 문구를 입력했습니다');
      expect(result.message).toContain('옵션값 입력칸을 클릭하고 동의 문구를 입력했습니다');
      expect(result.message).toContain('옵션목록으로 적용 버튼을 클릭했습니다');
      expect(result.message).toContain('저장하기 버튼 클릭 단계는 주석 처리되어 실행하지 않았습니다');
    }
    expect((document.querySelector('#preorderType') as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector('#testTimePicker')).toBeNull();
    expect((document.querySelector('#orderStart') as HTMLInputElement).value).toBe(
      `${getTestToday().isoDate}T19:00`,
    );
    expect((document.querySelector('#orderEnd') as HTMLInputElement).value).toBe(
      `${getOneYearLaterTestDate().isoDate}T18:59`,
    );
    expect(document.querySelector('#postOnSale')?.className).toContain('active');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-opened')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-year-next')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-month-next-count')).toBe(
      '3',
    );
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-latest-date-clicked')).toBe(
      'true',
    );
    expect((document.querySelector('#dispatchEnd') as HTMLInputElement).value).toBe(
      getDispatchLatestTestDate().isoDate,
    );
    expect(document.querySelector('#optionSection')?.getAttribute('data-scrolled')).toBe('true');
    expect(document.querySelector('#optionExpand')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#selectableOptionOn')?.className).toContain('active');
    expect((document.querySelector('#optionTypeSingle') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#optionName') as HTMLInputElement).value).toBe(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect((document.querySelector('#optionValue') as HTMLInputElement).value).toBe(
      '동의합니다.',
    );
    expect(document.querySelector('#optionApply')?.getAttribute('data-clicked')).toBe('true');
    expect(document.querySelector('#optionList')?.textContent).toContain(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect(document.querySelector('#optionList')?.textContent).toContain('동의합니다.');
    expect(saveHandler).not.toHaveBeenCalled();
  });

  it('opens preorder settings, clicks only the preorder-row enabled button, and selects today', async () => {
    const {
      expandButton,
      subscriptionButton,
      calendarHandler,
      steps,
    } = renderCollapsedPreorderEditor();
    const saveHandler = vi.fn();
    document.querySelector('#saveButton')?.addEventListener('click', saveHandler);

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('예약구매 설정함 버튼을 클릭했고 주문기간 영역이 열렸습니다');
      expect(result.message).toContain('주문기간 시작 달력을 열었습니다');
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
      expect(result.message).toContain('주문기간 종료 달력을 열었습니다');
      expect(result.message).toContain('오른쪽 이중 화살표를 정확히 1번 눌렀습니다');
      expect(result.message).toContain('가장 늦은 시간까지 선택했습니다');
      expect(result.message).toContain('판매 상태를 판매 중으로 선택했습니다');
      expect(result.message).toContain('발송완료일 달력을 열었습니다');
      expect(result.message).toContain('발송완료일 달력의 오른쪽 이중 화살표를 정중앙으로 정확히 1번 눌렀습니다');
      expect(result.message).toContain('오른쪽 한 개 화살표를 400ms 간격으로 정확히 3번 눌렀습니다');
      expect(result.message).toContain('선택 가능한 가장 마지막 날짜를 정중앙으로 눌렀습니다');
      expect(result.message).toContain('옵션 섹션 아래 화살표 버튼을 클릭했습니다');
      expect(result.message).toContain('선택형 설정함 버튼을 클릭했습니다');
      expect(result.message).toContain('단독형 라디오 버튼을 정중앙으로 클릭했습니다');
      expect(result.message).toContain('옵션명 입력칸을 클릭하고 필수 문구를 입력했습니다');
      expect(result.message).toContain('옵션값 입력칸을 클릭하고 동의 문구를 입력했습니다');
      expect(result.message).toContain('옵션목록으로 적용 버튼을 클릭했습니다');
      expect(result.message).toContain('저장하기 버튼 클릭 단계는 주석 처리되어 실행하지 않았습니다');
    }
    expect(expandButton.getAttribute('aria-expanded')).toBe('true');
    expect(subscriptionButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#orderPeriod')?.textContent).toContain('주문기간');
    expect(document.querySelector('#subscriptionOn')?.getAttribute('data-clicked')).toBeNull();
    expect(document.querySelector('#selectableOptionOn')?.getAttribute('data-clicked')).toBeNull();
    expect(document.querySelector('#postOnSale')?.className).toContain('active');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-opened')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-year-next')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-month-next-count')).toBe(
      '3',
    );
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-latest-date-clicked')).toBe(
      'true',
    );
    expect((document.querySelector('#dispatchEnd') as HTMLInputElement).value).toBe(
      getDispatchLatestTestDate().isoDate,
    );
    expect(document.querySelector('#optionSection')?.getAttribute('data-scrolled')).toBe('true');
    expect(document.querySelector('#optionExpand')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#selectableOptionOn')?.className).toContain('active');
    expect((document.querySelector('#optionTypeSingle') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#optionName') as HTMLInputElement).value).toBe(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect((document.querySelector('#optionValue') as HTMLInputElement).value).toBe(
      '동의합니다.',
    );
    expect(document.querySelector('#optionApply')?.getAttribute('data-clicked')).toBe('true');
    expect(document.querySelector('#optionList')?.textContent).toContain(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect(document.querySelector('#optionList')?.textContent).toContain('동의합니다.');
    expect(saveHandler).not.toHaveBeenCalled();
    expect(document.querySelector('#testDatePicker')?.textContent).toContain(
      `${getTestToday().year}.${String(getTestToday().month).padStart(2, '0')}`,
    );
    expect(calendarHandler).toHaveBeenCalledTimes(1);
    expect(steps).toEqual([
      'preorder-expand',
      'scroll-preorder-on',
      'preorder-on',
      'scroll-order-start-calendar',
      'calendar',
      'today',
      'time-19:00',
      'scroll-order-end-calendar',
      'order-end-calendar',
      'year-next',
      'one-year-later-today',
      'time-18:59',
      'post-on-sale',
      'dispatch-calendar',
      'dispatch-year-next',
      'dispatch-month-next',
      'dispatch-month-next',
      'dispatch-month-next',
      'dispatch-latest-date',
      'scroll-option-section',
      'option-expand',
      'selectable-option-on',
      'single-option-type',
      'option-name-click',
      'option-value-click',
      'scroll-option-apply',
      'option-apply',
    ]);
  });

  it('uses the current system date for the order period start instead of a fixed day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10, 30, 0));
    vi.spyOn(WaitStrategy.prototype, 'throttle').mockResolvedValue();

    try {
      const { steps } = renderCollapsedPreorderEditor({
        includePreviousDayInStartPicker: true,
        onPreviousDayClick: () => steps.push('previous-day-19'),
      });

      const driver = createDriver(createGateway(), createCollapsedRegistry());
      const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

      expect('state' in result).toBe(true);
      if ('state' in result) {
        expect(result.state).toBe(ProductProcessingState.STOPPED);
        expect(result.message).toContain('시스템 오늘 날짜(2026-05-20)');
      }
      expect(steps).toContain('today');
      expect(steps).toContain('time-19:00');
      expect(steps).not.toContain('previous-day-19');
      expect((document.querySelector('#orderStart') as HTMLInputElement).value).toBe(
        '2026-05-20T19:00',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the rightmost header control when the year-next arrow is icon-only', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      iconOnlyEndYearNavigation: true,
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('오른쪽 이중 화살표를 정확히 1번 눌렀습니다');
    }
    expect(steps).toContain('year-next');
  });

  it('does not claim the date step completed when clicking today does not open time selection', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      todayClickOpensTimePicker: false,
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('시간 선택으로 넘어가지 않았습니다');
      expect(result.message).not.toContain('가장 빠른 시간까지 선택했습니다');
    }
    expect(document.querySelector('#testTimePicker')).toBeNull();
    expect(steps).toContain('today');
  });

  it('clicks the first dark available time when its parent inherits muted picker color', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      earliestTimeParentMuted: true,
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
    }
    expect(steps).toContain('time-19:00');
    expect((document.querySelector('#orderStart') as HTMLInputElement).value).toBe(
      `${getTestToday().isoDate}T19:00`,
    );
  });

  it('uses a user-like click detail when selecting the earliest time option', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      timeRequiresClickDetail: true,
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
    }
    expect(steps).toContain('time-19:00');
    expect(document.querySelector('#testTimePicker')).toBeNull();
  });

  it('falls back to the order-period input when the time picker swallows click events', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      earliestTimeClickIgnored: true,
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('입력값으로 반영했습니다');
    }
    expect(steps).not.toContain('time-19:00');
    expect((document.querySelector('#orderStart') as HTMLInputElement).value).toBe(
      `${getTestToday().isoDate}T19:00`,
    );
  });

  it('uses the trusted browser click port before falling back to direct input writes', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      earliestTimeClickIgnored: true,
      earliestTimeRect: { left: 180, top: 320, width: 42, height: 18 },
    });
    const trustedClick = vi.fn(async () => {
      const input = document.querySelector('#orderStart') as HTMLInputElement | null;
      if (input) {
        input.value = `${getTestToday().isoDate}T19:00`;
      }
      document.querySelector('#testTimePicker')?.remove();
      steps.push('trusted-time-click');
      return true;
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry(), trustedClick);
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
      expect(result.message).not.toContain('입력값으로 반영했습니다');
    }
    expect(trustedClick).toHaveBeenCalled();
    expect(steps).toContain('trusted-time-click');
    expect(steps).not.toContain('time-19:00');
  });

  it('uses the page time handler before synthetic DOM clicks', async () => {
    const { steps } = renderCollapsedPreorderEditor({
      earliestTimeClickIgnored: true,
    });
    const pageTimeClick = vi.fn(async () => {
      const input = document.querySelector('#orderStart') as HTMLInputElement | null;
      if (input) {
        input.value = `${getTestToday().isoDate}T19:00`;
      }
      document.querySelector('#testTimePicker')?.remove();
      steps.push('page-time-click');
      return true;
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry(), undefined, pageTimeClick);
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('페이지 핸들러로 선택했습니다');
    }
    expect(pageTimeClick).toHaveBeenCalledWith({ label: '19:00', preference: 'earliest' });
    expect(steps).toContain('page-time-click');
    expect(steps).not.toContain('time-19:00');
  });

  it('uses the page preorder disclosure handler before the fallback arrow click', async () => {
    const { steps } = renderCollapsedPreorderEditor();
    const pagePreorderDisclosureClick = vi.fn(async () => {
      const expandButton = document.querySelector('#expandPreorder') as HTMLButtonElement | null;
      expandButton?.click();
      steps.push('page-preorder-disclosure-click');
      return true;
    });
    const pagePreorderEnabledClick = vi.fn(async () => {
      steps.push('page-preorder-enabled-click');
      return true;
    });

    const driver = createDriver(
      createGateway(),
      createCollapsedRegistry(),
      undefined,
      undefined,
      pagePreorderDisclosureClick,
      pagePreorderEnabledClick,
    );
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('페이지 핸들러로 클릭해 먼저 펼쳤습니다');
      expect(result.message).toContain('input#preOrder1_1');
    }
    expect(pagePreorderDisclosureClick).toHaveBeenCalled();
    expect(pagePreorderEnabledClick).toHaveBeenCalled();
    expect(steps).toEqual(
      expect.arrayContaining([
        'page-preorder-disclosure-click',
        'preorder-expand',
        'page-preorder-enabled-click',
      ]),
    );
  });

  it('uses mouse events for calendar day cells before judging the date step complete', async () => {
    const centerEvents: Array<{ x: number; y: number }> = [];
    const timeCenterEvents: Array<{ x: number; y: number }> = [];
    const endDateCenterEvents: Array<{ x: number; y: number }> = [];
    const endTimeCenterEvents: Array<{ x: number; y: number }> = [];
    const dispatchYearNextCenterEvents: Array<{ x: number; y: number }> = [];
    const dispatchMonthNextCenterEvents: Array<{ x: number; y: number }> = [];
    const dispatchLatestDateCenterEvents: Array<{ x: number; y: number }> = [];
    const singleOptionTypeCenterEvents: Array<{ x: number; y: number }> = [];
    const optionNameCenterEvents: Array<{ x: number; y: number }> = [];
    const optionValueCenterEvents: Array<{ x: number; y: number }> = [];
    const { steps } = renderCollapsedPreorderEditor({
      todayActivationEvent: 'mousedown',
      todayCellMarkup: 'cell',
      todayRect: { left: 120, top: 240, width: 28, height: 28 },
      earliestTimeRect: { left: 180, top: 320, width: 42, height: 18 },
      endDateRect: { left: 220, top: 420, width: 28, height: 28 },
      latestTimeRect: { left: 260, top: 520, width: 42, height: 18 },
      dispatchYearNextRect: { left: 400, top: 620, width: 30, height: 30 },
      dispatchMonthNextRect: { left: 450, top: 620, width: 30, height: 30 },
      dispatchLatestDateRect: { left: 480, top: 700, width: 28, height: 28 },
      singleOptionTypeRect: { left: 520, top: 760, width: 24, height: 24 },
      optionNameRect: { left: 540, top: 800, width: 140, height: 28 },
      optionValueRect: { left: 720, top: 800, width: 180, height: 28 },
      onTodayMouseDown: (event) => {
        centerEvents.push({ x: event.clientX, y: event.clientY });
      },
      onEarliestTimeMouseDown: (event) => {
        timeCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onEndDateMouseDown: (event) => {
        endDateCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onLatestTimeMouseDown: (event) => {
        endTimeCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onDispatchYearNextMouseDown: (event) => {
        dispatchYearNextCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onDispatchMonthNextMouseDown: (event) => {
        dispatchMonthNextCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onDispatchLatestDateMouseDown: (event) => {
        dispatchLatestDateCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onSingleOptionTypeMouseDown: (event) => {
        singleOptionTypeCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onOptionNameMouseDown: (event) => {
        optionNameCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
      onOptionValueMouseDown: (event) => {
        optionValueCenterEvents.push({ x: event.clientX, y: event.clientY });
      },
    });

    const driver = createDriver(createGateway(), createCollapsedRegistry());
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('가장 빠른 시간까지 선택했습니다');
      expect(result.message).toContain('주문기간 종료 달력을 열었습니다');
      expect(result.message).toContain('오른쪽 이중 화살표를 정확히 1번 눌렀습니다');
      expect(result.message).toContain('1년 뒤 오늘 날짜를 정중앙으로 눌렀습니다');
      expect(result.message).toContain('가장 늦은 시간까지 선택했습니다');
      expect(result.message).toContain('판매 상태를 판매 중으로 선택했습니다');
      expect(result.message).toContain('발송완료일 달력을 열었습니다');
      expect(result.message).toContain('발송완료일 달력의 오른쪽 이중 화살표를 정중앙으로 정확히 1번 눌렀습니다');
      expect(result.message).toContain('오른쪽 한 개 화살표를 400ms 간격으로 정확히 3번 눌렀습니다');
      expect(result.message).toContain('선택 가능한 가장 마지막 날짜를 정중앙으로 눌렀습니다');
      expect(result.message).toContain('옵션 섹션 아래 화살표 버튼을 클릭했습니다');
      expect(result.message).toContain('선택형 설정함 버튼을 클릭했습니다');
      expect(result.message).toContain('단독형 라디오 버튼을 정중앙으로 클릭했습니다');
      expect(result.message).toContain('옵션명 입력칸을 클릭하고 필수 문구를 입력했습니다');
      expect(result.message).toContain('옵션값 입력칸을 클릭하고 동의 문구를 입력했습니다');
      expect(result.message).toContain('옵션목록으로 적용 버튼을 클릭했습니다');
      expect(result.message).toContain('저장하기 버튼 클릭 단계는 주석 처리되어 실행하지 않았습니다');
    }
    expect(document.querySelector('#testTimePicker')).toBeNull();
    expect(centerEvents.at(0)).toEqual({ x: 134, y: 254 });
    expect(timeCenterEvents.at(0)).toEqual({ x: 201, y: 329 });
    expect(endDateCenterEvents.at(0)).toEqual({ x: 234, y: 434 });
    expect(endTimeCenterEvents.at(0)).toEqual({ x: 281, y: 529 });
    expect(dispatchYearNextCenterEvents.at(0)).toEqual({ x: 415, y: 635 });
    expect(dispatchMonthNextCenterEvents).toEqual([
      { x: 465, y: 635 },
      { x: 465, y: 635 },
      { x: 465, y: 635 },
    ]);
    expect(dispatchLatestDateCenterEvents.at(0)).toEqual({ x: 494, y: 714 });
    expect(singleOptionTypeCenterEvents.at(0)).toEqual({ x: 532, y: 772 });
    expect(optionNameCenterEvents.at(0)).toEqual({ x: 610, y: 814 });
    expect(optionValueCenterEvents.at(0)).toEqual({ x: 810, y: 814 });
    expect((document.querySelector('#optionName') as HTMLInputElement).value).toBe(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect((document.querySelector('#optionValue') as HTMLInputElement).value).toBe(
      '동의합니다.',
    );
    expect(document.querySelector('#optionApply')?.getAttribute('data-clicked')).toBe('true');
    expect(document.querySelector('#optionList')?.textContent).toContain(
      '해외 유통구조상 예약캔슬 불가',
    );
    expect(document.querySelector('#optionList')?.textContent).toContain('동의합니다.');
    expect(steps).toEqual([
      'preorder-expand',
      'scroll-preorder-on',
      'preorder-on',
      'scroll-order-start-calendar',
      'calendar',
      'today',
      'time-19:00',
      'scroll-order-end-calendar',
      'order-end-calendar',
      'year-next',
      'one-year-later-today',
      'time-18:59',
      'post-on-sale',
      'dispatch-calendar',
      'dispatch-year-next',
      'dispatch-month-next',
      'dispatch-month-next',
      'dispatch-month-next',
      'dispatch-latest-date',
      'scroll-option-section',
      'option-expand',
      'selectable-option-on',
      'single-option-type',
      'option-name-click',
      'option-value-click',
      'scroll-option-apply',
      'option-apply',
    ]);
  });

  it('stops without clicking again when preorder is already selected', async () => {
    renderEditor({ preorderChecked: true, normalChecked: false });

    const driver = createDriver();
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('이미 선택');
    }
  });

  it('stops when product type state cannot be verified', async () => {
    renderEditor({ preorderChecked: false, normalChecked: false });

    const driver = createDriver();
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if (!('state' in result)) {
      throw new Error('Expected a processing result.');
    }
    expect(result.state).toBe(ProductProcessingState.VERIFICATION_REQUIRED);
    expect(result.retryable).toBe(false);
    expect(result.message).toContain('어떤 상태인지 확정할 수 없어');
  });

  it('stops when a product detail page is open instead of the edit page', async () => {
    renderEditor({ preorderChecked: false, normalChecked: true });

    const driver = createDriver(
      createGateway('https://sell.smartstore.naver.com/#/products/detail/123456'),
    );
    const result = await driver.preparePreorderChangePlan(createProduct(), createRunPolicy());

    expect('state' in result).toBe(true);
    if (!('state' in result)) {
      throw new Error('Expected a processing result.');
    }
    expect(result.state).toBe(ProductProcessingState.VERIFICATION_REQUIRED);
    expect(result.message).toContain('상품 상세보기 화면');
  });

  it('clicks preorder, writes required settings, saves, and verifies the result', async () => {
    renderEditor({ preorderChecked: false, normalChecked: true });

    const saveButton = document.querySelector('#saveButton') as HTMLButtonElement;
    const saveHandler = vi.fn();
    saveButton.addEventListener('click', saveHandler);

    const driver = createDriver();
    const result = await driver.applyPreorderChangePlan(createPlan(false));

    expect(result.state, JSON.stringify(result)).toBe(ProductProcessingState.SUCCEEDED);
    expect((document.querySelector('#preorderType') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#orderStart') as HTMLInputElement).value).toBe(
      `${getTestToday().isoDate}T19:00`,
    );
    expect((document.querySelector('#orderEnd') as HTMLInputElement).value).toBe(
      `${getOneYearLaterTestDate().isoDate}T18:59`,
    );
    expect(document.querySelector('#postOnSale')?.className).toContain('active');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-opened')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-year-next')).toBe('true');
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-month-next-count')).toBe(
      '3',
    );
    expect(document.querySelector('#dispatchCalendar')?.getAttribute('data-latest-date-clicked')).toBe(
      'true',
    );
    expect((document.querySelector('#dispatchEnd') as HTMLInputElement).value).toBe(
      getDispatchLatestTestDate().isoDate,
    );
    expect(document.querySelector('#optionSection')?.getAttribute('data-scrolled')).toBe('true');
    expect(document.querySelector('#optionExpand')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('#selectableOptionOn')?.className).toContain('active');
    expect(document.querySelector('#directInputOptionOn')?.getAttribute('data-clicked')).toBeNull();
    expect((document.querySelector('#optionTypeSingle') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('#optionTypeCombination') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('#optionName') as HTMLInputElement).value).toBe('해외 유통구조상 예약캔슬 불가');
    expect((document.querySelector('#optionValue') as HTMLInputElement).value).toBe('동의합니다.');
    expect(document.querySelector('#optionApply')?.getAttribute('data-scrolled')).toBe('true');
    expect(document.querySelector('#optionApply')?.getAttribute('data-clicked')).toBe('true');
    expect(document.querySelector('#optionList')?.textContent).toContain('해외 유통구조상 예약캔슬 불가');
    expect(document.querySelector('#optionList')?.textContent).toContain('동의합니다.');
    expect(saveHandler).toHaveBeenCalledTimes(1);
  });

  it('dry-run verifies readiness without clicking or saving', async () => {
    renderEditor({ preorderChecked: false, normalChecked: true });

    const saveButton = document.querySelector('#saveButton') as HTMLButtonElement;
    const saveHandler = vi.fn();
    saveButton.addEventListener('click', saveHandler);

    const driver = createDriver();
    const result = await driver.applyPreorderChangePlan(createPlan(true));

    expect(result.state).toBe(ProductProcessingState.DRY_RUN_READY);
    expect((document.querySelector('#preorderType') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('#optionName') as HTMLInputElement | null)?.value ?? '').toBe('');
    expect(saveHandler).not.toHaveBeenCalled();
  });
});

function renderEditor(input: {
  preorderChecked: boolean;
  normalChecked: boolean;
}) {
  document.body.innerHTML = `
    <section id="preorder">
      <h2>판매유형</h2>
      <label>
        <input
          id="preorderType"
          name="productType"
          type="radio"
          aria-label="예약구매"
          ${input.preorderChecked ? 'checked' : ''}
        />
        예약구매
      </label>
      <label>
        <input
          id="normalType"
          name="productType"
          type="radio"
          aria-label="일반상품"
          ${input.normalChecked ? 'checked' : ''}
        />
        일반상품
      </label>
      <label id="orderPeriod">
        주문기간
        <input id="orderStart" />
        <button id="orderStartCalendar" aria-label="달력" type="button"></button>
        ~
        <input id="orderEnd" type="datetime-local" max="${getOneYearLaterTestDate().isoDate}T19:59" />
        <button id="orderEndCalendar" aria-label="달력" type="button"></button>
      </label>
      <label>
        예약구매 기간 종료 후 상품 판매 상태
        <div id="postStatus" role="radiogroup">
          <button id="postStopped" class="active" type="button">판매종료</button>
          <button id="postOnSale" type="button">판매 중</button>
        </div>
      </label>
      <label id="dispatchDate">
        발송완료일
        <input id="dispatchEnd" type="date" max="2026-07-07" />
        <button id="dispatchCalendar" aria-label="달력" type="button"></button>
      </label>
    </section>
    <section id="optionSection">
      <h2>옵션 설정</h2>
      <button id="optionExpand" aria-expanded="false" type="button">설정안함</button>
      <div id="optionBody"></div>
    </section>
    <button id="saveButton">저장</button>
    <div id="successFeedback">저장되었습니다</div>
  `;

  document.querySelector('#orderStartCalendar')?.addEventListener('click', () => {
    renderTodayDatePicker(undefined, (time) => {
      const input = document.querySelector('#orderStart') as HTMLInputElement | null;
      if (input) {
        input.value = `${getTestToday().isoDate}T${time}`;
      }
    });
  });
  document.querySelector('#orderEndCalendar')?.addEventListener('click', () => {
    renderOneYearLaterDatePicker((time) => {
      const input = document.querySelector('#orderEnd') as HTMLInputElement | null;
      if (input) {
        input.value = `${getOneYearLaterTestDate().isoDate}T${time}`;
      }
    });
  });
  document.querySelector('#postOnSale')?.addEventListener('click', () => {
    const stopped = document.querySelector('#postStopped') as HTMLButtonElement | null;
    const onSale = document.querySelector('#postOnSale') as HTMLButtonElement | null;
    if (stopped && onSale) {
      stopped.className = '';
      onSale.className = 'active';
    }
  });
  document.querySelector('#dispatchCalendar')?.addEventListener('click', (event) => {
    (event.currentTarget as HTMLElement).setAttribute('data-opened', 'true');
    renderDispatchDatePicker();
  });
  const optionExpand = document.querySelector('#optionExpand') as HTMLButtonElement | null;
  const optionSection = document.querySelector('#optionSection') as HTMLElement | null;
  if (optionSection) {
    optionSection.scrollIntoView = () => {
      optionSection.setAttribute('data-scrolled', 'true');
    };
  }
  if (optionExpand) {
    optionExpand.addEventListener('click', () => {
      optionExpand.setAttribute('aria-expanded', 'true');
      const body = document.querySelector('#optionBody') as HTMLDivElement | null;
      if (body) {
        body.innerHTML = `
          <div id="selectableOptionRow">
            <span>선택형</span>
            <button id="selectableOptionOn" type="button">설정함</button>
            <button id="selectableOptionOff" class="active" type="button">설정안함</button>
          </div>
          <div id="directInputOptionRow">
            <span>직접입력형</span>
            <button id="directInputOptionOn" type="button">설정함</button>
            <button id="directInputOptionOff" class="active" type="button">설정안함</button>
          </div>
          <div id="optionConfig"></div>
        `;

        document.querySelector('#selectableOptionOn')?.addEventListener('click', () => {
          document.querySelector('#selectableOptionOn')?.setAttribute('class', 'active');
          document.querySelector('#selectableOptionOff')?.setAttribute('class', '');
          const config = document.querySelector('#optionConfig') as HTMLDivElement | null;
          if (config) {
            config.innerHTML = `
              <div id="optionTypeRow">
                <span>옵션 구성타입</span>
                <label id="optionTypeSingleLabel">
                  <input id="optionTypeSingle" name="optionType" type="radio" value="SINGLE" />
                  단독형
                </label>
                <label id="optionTypeCombinationLabel">
                  <input id="optionTypeCombination" name="optionType" type="radio" value="COMBINATION" checked />
                  조합형
                </label>
              </div>
              <label for="optionName">옵션명</label>
              <input id="optionName" />
              <label for="optionValue">옵션값</label>
              <input id="optionValue" />
              <button id="optionApply" type="button">옵션목록으로 적용 ↓</button>
              <div id="optionList">데이터가 존재하지 않습니다.</div>
            `;
          }
          const singleType = document.querySelector('#optionTypeSingle') as HTMLInputElement | null;
          const combinationType = document.querySelector('#optionTypeCombination') as HTMLInputElement | null;
          singleType?.addEventListener('click', () => {
            singleType.checked = true;
            if (combinationType) {
              combinationType.checked = false;
            }
          });
          const optionApply = document.querySelector('#optionApply') as HTMLButtonElement | null;
          if (optionApply) {
            optionApply.scrollIntoView = () => {
              optionApply.setAttribute('data-scrolled', 'true');
            };
            optionApply.addEventListener('click', () => {
              optionApply.setAttribute('data-clicked', 'true');
              const list = document.querySelector('#optionList') as HTMLDivElement | null;
              const name = (document.querySelector('#optionName') as HTMLInputElement | null)?.value ?? '';
              const value = (document.querySelector('#optionValue') as HTMLInputElement | null)?.value ?? '';
              if (list) {
                list.textContent = `${name} / ${value}`;
              }
            });
          }
        });
        document.querySelector('#directInputOptionOn')?.addEventListener('click', () => {
          document.querySelector('#directInputOptionOn')?.setAttribute('data-clicked', 'true');
        });
      }
    });
  }
}

function renderCollapsedPreorderEditor(
  options: {
    todayActivationEvent?: 'click' | 'mousedown';
    todayCellMarkup?: 'button' | 'cell';
    todayClickOpensTimePicker?: boolean;
    includePreviousDayInStartPicker?: boolean;
    iconOnlyEndYearNavigation?: boolean;
    earliestTimeParentMuted?: boolean;
    timeRequiresClickDetail?: boolean;
    earliestTimeClickIgnored?: boolean;
    todayRect?: { left: number; top: number; width: number; height: number };
    earliestTimeRect?: { left: number; top: number; width: number; height: number };
    endDateRect?: { left: number; top: number; width: number; height: number };
    latestTimeRect?: { left: number; top: number; width: number; height: number };
    dispatchYearNextRect?: { left: number; top: number; width: number; height: number };
    dispatchMonthNextRect?: { left: number; top: number; width: number; height: number };
    dispatchLatestDateRect?: { left: number; top: number; width: number; height: number };
    singleOptionTypeRect?: { left: number; top: number; width: number; height: number };
    optionNameRect?: { left: number; top: number; width: number; height: number };
    optionValueRect?: { left: number; top: number; width: number; height: number };
    onTodayMouseDown?: (event: MouseEvent) => void;
    onPreviousDayClick?: () => void;
    onEarliestTimeMouseDown?: (event: MouseEvent) => void;
    onEndDateMouseDown?: (event: MouseEvent) => void;
    onLatestTimeMouseDown?: (event: MouseEvent) => void;
    onDispatchYearNextMouseDown?: (event: MouseEvent) => void;
    onDispatchMonthNextMouseDown?: (event: MouseEvent) => void;
    onDispatchLatestDateMouseDown?: (event: MouseEvent) => void;
    onSingleOptionTypeMouseDown?: (event: MouseEvent) => void;
    onOptionNameMouseDown?: (event: MouseEvent) => void;
    onOptionValueMouseDown?: (event: MouseEvent) => void;
  } = {},
) {
  const steps: string[] = [];
  document.body.innerHTML = `
    <main id="productEditForm">
      <section id="subscription">
        <h2>정기구독 설정</h2>
        <button id="expandSubscription" aria-expanded="false">설정안함</button>
        <button id="subscriptionOn" type="button">설정함</button>
      </section>
      <section id="reservation">
        <h2>예약구매</h2>
        <button id="expandPreorder" aria-expanded="false">설정안함</button>
        <div id="reservationBody"></div>
      </section>
    </main>
    <section id="optionSection">
      <h2>옵션</h2>
      <button id="optionExpand" aria-expanded="false" type="button">설정안함</button>
      <div id="optionBody"></div>
    </section>
    <button id="saveButton">저장</button>
    <div id="successFeedback">저장되었습니다</div>
  `;

  const subscriptionButton = document.querySelector('#expandSubscription') as HTMLButtonElement;
  subscriptionButton.addEventListener('click', () => {
    steps.push('subscription-expand');
    subscriptionButton.setAttribute('aria-expanded', 'true');
  });
  document.querySelector('#subscriptionOn')?.addEventListener('click', (event) => {
    (event.currentTarget as HTMLElement).setAttribute('data-clicked', 'true');
  });
  const optionExpand = document.querySelector('#optionExpand') as HTMLButtonElement | null;
  const optionSection = document.querySelector('#optionSection') as HTMLElement | null;
  if (optionSection) {
    optionSection.scrollIntoView = () => {
      steps.push('scroll-option-section');
      optionSection.setAttribute('data-scrolled', 'true');
    };
  }
  optionExpand?.addEventListener('click', () => {
    steps.push('option-expand');
    optionExpand.setAttribute('aria-expanded', 'true');
    const body = document.querySelector('#optionBody') as HTMLDivElement | null;
    if (body) {
      body.innerHTML = `
        <div id="selectableOptionRow">
          <span>선택형</span>
          <button id="selectableOptionOn" type="button">설정함</button>
          <button id="selectableOptionOff" class="active" type="button">설정안함</button>
        </div>
      `;

      const selectableOptionOn = document.querySelector('#selectableOptionOn') as HTMLButtonElement | null;
      const selectableOptionOff = document.querySelector('#selectableOptionOff') as HTMLButtonElement | null;
      selectableOptionOn?.addEventListener('click', () => {
        steps.push('selectable-option-on');
        selectableOptionOn.className = 'active';
        if (selectableOptionOff) {
          selectableOptionOff.className = '';
        }
        const config = document.querySelector('#optionConfig') as HTMLDivElement | null;
        if (!config) {
          body.insertAdjacentHTML(
            'beforeend',
            `
              <div id="optionConfig">
                <span>옵션 구성타입</span>
                <label id="optionTypeSingleLabel">
                  <input id="optionTypeSingle" name="optionType" type="radio" value="SINGLE" />
                  단독형
                </label>
                <label id="optionTypeCombinationLabel">
                  <input id="optionTypeCombination" name="optionType" type="radio" value="COMBINATION" checked />
                  조합형
                </label>
                <label for="optionName">옵션명</label>
                <input id="optionName" />
                <label for="optionValue">옵션값</label>
                <input id="optionValue" />
                <button id="optionApply" type="button">옵션목록으로 적용 ↓</button>
                <div id="optionList">데이터가 존재하지 않습니다.</div>
              </div>
            `,
          );
        }

        const singleType = document.querySelector('#optionTypeSingle') as HTMLInputElement | null;
        const combinationType = document.querySelector('#optionTypeCombination') as HTMLInputElement | null;
        const optionName = document.querySelector('#optionName') as HTMLInputElement | null;
        const optionValue = document.querySelector('#optionValue') as HTMLInputElement | null;
        const optionApply = document.querySelector('#optionApply') as HTMLButtonElement | null;
        if (singleType && options.singleOptionTypeRect) {
          singleType.getBoundingClientRect = () =>
            ({
              left: options.singleOptionTypeRect?.left ?? 0,
              top: options.singleOptionTypeRect?.top ?? 0,
              width: options.singleOptionTypeRect?.width ?? 0,
              height: options.singleOptionTypeRect?.height ?? 0,
              right: (options.singleOptionTypeRect?.left ?? 0) + (options.singleOptionTypeRect?.width ?? 0),
              bottom: (options.singleOptionTypeRect?.top ?? 0) + (options.singleOptionTypeRect?.height ?? 0),
              x: options.singleOptionTypeRect?.left ?? 0,
              y: options.singleOptionTypeRect?.top ?? 0,
              toJSON: () => ({}),
            }) as DOMRect;
        }
        if (optionName && options.optionNameRect) {
          optionName.getBoundingClientRect = () =>
            ({
              left: options.optionNameRect?.left ?? 0,
              top: options.optionNameRect?.top ?? 0,
              width: options.optionNameRect?.width ?? 0,
              height: options.optionNameRect?.height ?? 0,
              right: (options.optionNameRect?.left ?? 0) + (options.optionNameRect?.width ?? 0),
              bottom: (options.optionNameRect?.top ?? 0) + (options.optionNameRect?.height ?? 0),
              x: options.optionNameRect?.left ?? 0,
              y: options.optionNameRect?.top ?? 0,
              toJSON: () => ({}),
            }) as DOMRect;
        }
        if (optionValue && options.optionValueRect) {
          optionValue.getBoundingClientRect = () =>
            ({
              left: options.optionValueRect?.left ?? 0,
              top: options.optionValueRect?.top ?? 0,
              width: options.optionValueRect?.width ?? 0,
              height: options.optionValueRect?.height ?? 0,
              right: (options.optionValueRect?.left ?? 0) + (options.optionValueRect?.width ?? 0),
              bottom: (options.optionValueRect?.top ?? 0) + (options.optionValueRect?.height ?? 0),
              x: options.optionValueRect?.left ?? 0,
              y: options.optionValueRect?.top ?? 0,
              toJSON: () => ({}),
            }) as DOMRect;
        }
        singleType?.addEventListener('mousedown', (event) => {
          options.onSingleOptionTypeMouseDown?.(event);
        });
        singleType?.addEventListener('click', () => {
          steps.push('single-option-type');
          singleType.checked = true;
          if (combinationType) {
            combinationType.checked = false;
          }
        });
        optionName?.addEventListener('mousedown', (event) => {
          options.onOptionNameMouseDown?.(event);
        });
        optionName?.addEventListener('click', () => {
          steps.push('option-name-click');
        });
        optionValue?.addEventListener('mousedown', (event) => {
          options.onOptionValueMouseDown?.(event);
        });
        optionValue?.addEventListener('click', () => {
          steps.push('option-value-click');
        });
        if (optionApply) {
          optionApply.scrollIntoView = () => {
            steps.push('scroll-option-apply');
            optionApply.setAttribute('data-scrolled', 'true');
          };
          optionApply.addEventListener('click', () => {
            steps.push('option-apply');
            optionApply.setAttribute('data-clicked', 'true');
            const list = document.querySelector('#optionList') as HTMLDivElement | null;
            const name = optionName?.value ?? '';
            const value = optionValue?.value ?? '';
            if (list) {
              list.textContent = `${name} / ${value}`;
            }
          });
        }
      });
    }
  });

  const expandButton = document.querySelector('#expandPreorder') as HTMLButtonElement;
  const calendarHandler = vi.fn();
  expandButton.addEventListener('click', () => {
    steps.push('preorder-expand');
    expandButton.setAttribute('aria-expanded', 'true');
    const body = document.querySelector('#reservationBody') as HTMLDivElement;
    body.innerHTML = `
      <div id="preorderControls">
        <button id="preorderOn">설정함</button>
        <button id="preorderOff" class="active">설정안함</button>
      </div>
    `;

    const preorderOn = document.querySelector('#preorderOn') as HTMLButtonElement;
    const preorderOff = document.querySelector('#preorderOff') as HTMLButtonElement;
    preorderOn.scrollIntoView = () => {
      steps.push('scroll-preorder-on');
    };
    preorderOn.addEventListener('click', () => {
      steps.push('preorder-on');
      preorderOff.className = '';
      const body = document.querySelector('#reservationBody') as HTMLDivElement;
      body.insertAdjacentHTML(
        'beforeend',
        `
          <label id="orderPeriod">
            주문기간
            <input id="orderStart" />
            <button id="orderStartCalendar" aria-label="달력" type="button"></button>
            <span>~</span>
            <input id="orderEnd" type="datetime-local" max="${getOneYearLaterTestDate().isoDate}T19:59" />
            <button id="orderEndCalendar" aria-label="달력" type="button"></button>
          </label>
          <label>
            예약구매 기간 종료 후 상품 판매 상태
            <div id="postStatus" role="radiogroup">
              <button id="postStopped" class="active" type="button">판매종료</button>
              <button id="postOnSale" type="button">판매 중</button>
            </div>
          </label>
          <label id="dispatchDate">
            발송완료일
            <input id="dispatchEnd" type="date" max="2026-07-07" />
            <button id="dispatchCalendar" aria-label="달력" type="button"></button>
          </label>
        `,
      );

      const orderStartCalendar = document.querySelector('#orderStartCalendar') as HTMLButtonElement;
      const orderEndCalendar = document.querySelector('#orderEndCalendar') as HTMLButtonElement;
      const dispatchCalendar = document.querySelector('#dispatchCalendar') as HTMLButtonElement;
      const postOnSale = document.querySelector('#postOnSale') as HTMLButtonElement;

      orderStartCalendar.scrollIntoView = () => {
        steps.push('scroll-order-start-calendar');
      };
      orderEndCalendar.scrollIntoView = () => {
        steps.push('scroll-order-end-calendar');
      };
      orderStartCalendar.addEventListener('click', () => {
        steps.push('calendar');
        renderTodayDatePicker(
          () => {
            steps.push('today');
          },
          (time) => {
            steps.push(`time-${time}`);
            const input = document.querySelector('#orderStart') as HTMLInputElement | null;
            if (input) {
              input.value = `${getTestToday().isoDate}T${time}`;
            }
          },
          {
            activationEvent: options.todayActivationEvent,
            cellMarkup: options.todayCellMarkup,
            opensTimePicker: options.todayClickOpensTimePicker,
            includePreviousDay: options.includePreviousDayInStartPicker,
            rect: options.todayRect,
            earliestTimeRect: options.earliestTimeRect,
            earliestTimeParentMuted: options.earliestTimeParentMuted,
            timeRequiresClickDetail: options.timeRequiresClickDetail,
            earliestTimeClickIgnored: options.earliestTimeClickIgnored,
            onMouseDown: options.onTodayMouseDown,
            onPreviousDayClick: options.onPreviousDayClick,
            onEarliestTimeMouseDown: options.onEarliestTimeMouseDown,
          },
        );
      });
      orderEndCalendar.addEventListener('click', () => {
        steps.push('order-end-calendar');
        renderOneYearLaterDatePicker(
          (time) => {
            steps.push(`time-${time}`);
            const input = document.querySelector('#orderEnd') as HTMLInputElement | null;
            if (input) {
              input.value = `${getOneYearLaterTestDate().isoDate}T${time}`;
            }
            calendarHandler();
          },
          {
            onYearNext: () => steps.push('year-next'),
            onDateClick: () => steps.push('one-year-later-today'),
            iconOnlyYearNavigation: options.iconOnlyEndYearNavigation,
            endDateRect: options.endDateRect,
            latestTimeRect: options.latestTimeRect,
            onEndDateMouseDown: options.onEndDateMouseDown,
            onLatestTimeMouseDown: options.onLatestTimeMouseDown,
          },
        );
      });
      postOnSale.addEventListener('click', () => {
        steps.push('post-on-sale');
        document.querySelector('#postStopped')?.setAttribute('class', '');
        postOnSale.setAttribute('class', 'active');
      });
      dispatchCalendar.addEventListener('click', () => {
        steps.push('dispatch-calendar');
        dispatchCalendar.setAttribute('data-opened', 'true');
        renderDispatchDatePicker({
          yearNextRect: options.dispatchYearNextRect,
          monthNextRect: options.dispatchMonthNextRect,
          latestDateRect: options.dispatchLatestDateRect,
          onYearNext: () => steps.push('dispatch-year-next'),
          onMonthNext: () => steps.push('dispatch-month-next'),
          onLatestDate: () => steps.push('dispatch-latest-date'),
          onYearNextMouseDown: options.onDispatchYearNextMouseDown,
          onMonthNextMouseDown: options.onDispatchMonthNextMouseDown,
          onLatestDateMouseDown: options.onDispatchLatestDateMouseDown,
        });
      });
    });
  });

  return { expandButton, subscriptionButton, calendarHandler, steps };
}

function renderTodayDatePicker(
  onTodayClick?: () => void,
  onTimeClick?: (time: string) => void,
  options: {
    activationEvent?: 'click' | 'mousedown';
    cellMarkup?: 'button' | 'cell';
    opensTimePicker?: boolean;
    includePreviousDay?: boolean;
    rect?: { left: number; top: number; width: number; height: number };
    earliestTimeRect?: { left: number; top: number; width: number; height: number };
    earliestTimeParentMuted?: boolean;
    timeRequiresClickDetail?: boolean;
    earliestTimeClickIgnored?: boolean;
    onMouseDown?: (event: MouseEvent) => void;
    onPreviousDayClick?: () => void;
    onEarliestTimeMouseDown?: (event: MouseEvent) => void;
  } = {},
): void {
  const today = getTestToday();
  const previous = getPreviousTestDate();
  document.querySelector('#testDatePicker')?.remove();
  document.querySelector('#testTimePicker')?.remove();
  const previousDateCell = options.includePreviousDay
    ? `<button id="testPreviousDayButton" type="button">${previous.day}</button>`
    : '';
  const dateCell =
    options.cellMarkup === 'cell'
      ? `<table><tbody><tr><td role="button"><span id="testTodayButton">${today.day}</span></td></tr></tbody></table>`
      : `<button id="testTodayButton" type="button">${today.day}</button>`;
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="testDatePicker">
        <div>${today.year}.${String(today.month).padStart(2, '0')}</div>
        <div>일 월 화 수 목 금 토</div>
        ${previousDateCell}
        ${dateCell}
      </div>
    `,
  );

  document.querySelector('#testPreviousDayButton')?.addEventListener('click', () => {
    const input = document.querySelector('#orderStart') as HTMLInputElement | null;
    if (input) {
      input.value = previous.isoDate;
    }
    options.onPreviousDayClick?.();
      renderTimePicker(previous, onTimeClick, 'earliest', {
        earliestTimeRect: options.earliestTimeRect,
        earliestTimeParentMuted: options.earliestTimeParentMuted,
        timeRequiresClickDetail: options.timeRequiresClickDetail,
        earliestTimeClickIgnored: options.earliestTimeClickIgnored,
        onEarliestTimeMouseDown: options.onEarliestTimeMouseDown,
      });
  });

  const todayButton = document.querySelector('#testTodayButton') as HTMLElement | null;
  if (todayButton && options.rect) {
    todayButton.getBoundingClientRect = () =>
      ({
        left: options.rect?.left ?? 0,
        top: options.rect?.top ?? 0,
        width: options.rect?.width ?? 0,
        height: options.rect?.height ?? 0,
        right: (options.rect?.left ?? 0) + (options.rect?.width ?? 0),
        bottom: (options.rect?.top ?? 0) + (options.rect?.height ?? 0),
        x: options.rect?.left ?? 0,
        y: options.rect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  todayButton?.addEventListener('mousedown', (event) => {
    options.onMouseDown?.(event);
  });
  todayButton?.addEventListener(options.activationEvent ?? 'click', () => {
    const input = document.querySelector('#orderStart') as HTMLInputElement | null;
    if (input) {
      input.value = today.isoDate;
    }
    onTodayClick?.();
    if (options.opensTimePicker !== false) {
      renderTimePicker(today, onTimeClick, 'earliest', {
        earliestTimeRect: options.earliestTimeRect,
        earliestTimeParentMuted: options.earliestTimeParentMuted,
        timeRequiresClickDetail: options.timeRequiresClickDetail,
        earliestTimeClickIgnored: options.earliestTimeClickIgnored,
        onEarliestTimeMouseDown: options.onEarliestTimeMouseDown,
      });
    }
  });
}

function renderOneYearLaterDatePicker(
  onTimeClick?: (time: string) => void,
  hooks: {
    onYearNext?: () => void;
    onDateClick?: () => void;
    iconOnlyYearNavigation?: boolean;
    endDateRect?: { left: number; top: number; width: number; height: number };
    latestTimeRect?: { left: number; top: number; width: number; height: number };
    onEndDateMouseDown?: (event: MouseEvent) => void;
    onLatestTimeMouseDown?: (event: MouseEvent) => void;
  } = {},
): void {
  const today = getTestToday();
  document.querySelector('#testDatePicker')?.remove();
  document.querySelector('#testTimePicker')?.remove();
  const navigationHtml = hooks.iconOnlyYearNavigation
    ? `
        <button id="testYearPrevDoubleButton" type="button" aria-label="이전 연도"></button>
        <button id="testMonthPrevButton" type="button" aria-label="이전 달"></button>
        <button id="testMonthNextButton" type="button" aria-label="다음 달"></button>
        <button id="testYearNextButton" type="button" aria-label=""></button>
      `
    : `<button id="testYearNextButton" type="button">»</button>`;

  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="testDatePicker">
        ${navigationHtml}
        <div>${today.year}.${String(today.month).padStart(2, '0')}</div>
        <div>일 월 화 수 목 금 토</div>
        <button type="button">${today.day}</button>
      </div>
    `,
  );

  document.querySelector('#testYearNextButton')?.addEventListener('click', () => {
    hooks.onYearNext?.();
    renderOneYearLaterTargetDatePicker(onTimeClick, hooks);
  });
}

function renderOneYearLaterTargetDatePicker(
  onTimeClick?: (time: string) => void,
  hooks: {
    onDateClick?: () => void;
    endDateRect?: { left: number; top: number; width: number; height: number };
    latestTimeRect?: { left: number; top: number; width: number; height: number };
    onEndDateMouseDown?: (event: MouseEvent) => void;
    onLatestTimeMouseDown?: (event: MouseEvent) => void;
  } = {},
): void {
  const target = getOneYearLaterTestDate();
  document.querySelector('#testDatePicker')?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="testDatePicker">
        <div>${target.year}.${String(target.month).padStart(2, '0')}</div>
        <div>일 월 화 수 목 금 토</div>
        <button id="testOneYearLaterButton" type="button">${target.day}</button>
      </div>
    `,
  );

  const oneYearLaterButton = document.querySelector('#testOneYearLaterButton') as HTMLElement | null;
  if (oneYearLaterButton && hooks.endDateRect) {
    oneYearLaterButton.getBoundingClientRect = () =>
      ({
        left: hooks.endDateRect?.left ?? 0,
        top: hooks.endDateRect?.top ?? 0,
        width: hooks.endDateRect?.width ?? 0,
        height: hooks.endDateRect?.height ?? 0,
        right: (hooks.endDateRect?.left ?? 0) + (hooks.endDateRect?.width ?? 0),
        bottom: (hooks.endDateRect?.top ?? 0) + (hooks.endDateRect?.height ?? 0),
        x: hooks.endDateRect?.left ?? 0,
        y: hooks.endDateRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  oneYearLaterButton?.addEventListener('mousedown', (event) => {
    hooks.onEndDateMouseDown?.(event);
  });
  oneYearLaterButton?.addEventListener('click', () => {
    hooks.onDateClick?.();
    renderTimePicker(target, onTimeClick, 'latest', {
      latestTimeRect: hooks.latestTimeRect,
      onLatestTimeMouseDown: hooks.onLatestTimeMouseDown,
    });
  });
}

function renderDispatchDatePicker(
  hooks: {
    yearNextRect?: { left: number; top: number; width: number; height: number };
    monthNextRect?: { left: number; top: number; width: number; height: number };
    latestDateRect?: { left: number; top: number; width: number; height: number };
    onYearNext?: () => void;
    onMonthNext?: () => void;
    onLatestDate?: () => void;
    onYearNextMouseDown?: (event: MouseEvent) => void;
    onMonthNextMouseDown?: (event: MouseEvent) => void;
    onLatestDateMouseDown?: (event: MouseEvent) => void;
  } = {},
): void {
  const today = getTestToday();
  document.querySelector('#testDatePicker')?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="testDatePicker">
        <button id="testDispatchYearNextButton" type="button">»</button>
        <button id="testDispatchMonthNextButton" type="button">›</button>
        <div>${today.year}.${String(today.month).padStart(2, '0')}</div>
        <div>일 월 화 수 목 금 토</div>
        ${Array.from({ length: 15 }, (_, index) => {
          const day = index + 1;
          const id = day === 15 ? ' id="testDispatchLatestDateButton"' : '';
          return `<button${id} type="button">${day}</button>`;
        }).join('')}
        <button type="button" class="disabled">16</button>
        <button type="button" class="disabled">17</button>
        <button type="button" class="disabled">18</button>
      </div>
    `,
  );

  const picker = document.querySelector('#testDatePicker') as HTMLElement | null;
  if (picker) {
    picker.scrollIntoView = () => {
      picker.setAttribute('data-scrolled', 'true');
    };
  }

  const dispatchYearNextButton = document.querySelector(
    '#testDispatchYearNextButton',
  ) as HTMLElement | null;
  if (dispatchYearNextButton && hooks.yearNextRect) {
    dispatchYearNextButton.getBoundingClientRect = () =>
      ({
        left: hooks.yearNextRect?.left ?? 0,
        top: hooks.yearNextRect?.top ?? 0,
        width: hooks.yearNextRect?.width ?? 0,
        height: hooks.yearNextRect?.height ?? 0,
        right: (hooks.yearNextRect?.left ?? 0) + (hooks.yearNextRect?.width ?? 0),
        bottom: (hooks.yearNextRect?.top ?? 0) + (hooks.yearNextRect?.height ?? 0),
        x: hooks.yearNextRect?.left ?? 0,
        y: hooks.yearNextRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  dispatchYearNextButton?.addEventListener('mousedown', (event) => {
    hooks.onYearNextMouseDown?.(event);
  });
  dispatchYearNextButton?.addEventListener('click', () => {
    hooks.onYearNext?.();
    document.querySelector('#dispatchCalendar')?.setAttribute('data-year-next', 'true');
  });
  const dispatchMonthNextButton = document.querySelector(
    '#testDispatchMonthNextButton',
  ) as HTMLElement | null;
  if (dispatchMonthNextButton && hooks.monthNextRect) {
    dispatchMonthNextButton.getBoundingClientRect = () =>
      ({
        left: hooks.monthNextRect?.left ?? 0,
        top: hooks.monthNextRect?.top ?? 0,
        width: hooks.monthNextRect?.width ?? 0,
        height: hooks.monthNextRect?.height ?? 0,
        right: (hooks.monthNextRect?.left ?? 0) + (hooks.monthNextRect?.width ?? 0),
        bottom: (hooks.monthNextRect?.top ?? 0) + (hooks.monthNextRect?.height ?? 0),
        x: hooks.monthNextRect?.left ?? 0,
        y: hooks.monthNextRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  dispatchMonthNextButton?.addEventListener('mousedown', (event) => {
    hooks.onMonthNextMouseDown?.(event);
  });
  dispatchMonthNextButton?.addEventListener('click', () => {
    hooks.onMonthNext?.();
    const target = document.querySelector('#dispatchCalendar');
    const current = Number(target?.getAttribute('data-month-next-count') ?? '0');
    target?.setAttribute('data-month-next-count', String(current + 1));
  });
  const dispatchLatestDateButton = document.querySelector(
    '#testDispatchLatestDateButton',
  ) as HTMLElement | null;
  if (dispatchLatestDateButton && hooks.latestDateRect) {
    dispatchLatestDateButton.getBoundingClientRect = () =>
      ({
        left: hooks.latestDateRect?.left ?? 0,
        top: hooks.latestDateRect?.top ?? 0,
        width: hooks.latestDateRect?.width ?? 0,
        height: hooks.latestDateRect?.height ?? 0,
        right: (hooks.latestDateRect?.left ?? 0) + (hooks.latestDateRect?.width ?? 0),
        bottom: (hooks.latestDateRect?.top ?? 0) + (hooks.latestDateRect?.height ?? 0),
        x: hooks.latestDateRect?.left ?? 0,
        y: hooks.latestDateRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  dispatchLatestDateButton?.addEventListener('mousedown', (event) => {
    hooks.onLatestDateMouseDown?.(event);
  });
  dispatchLatestDateButton?.addEventListener('click', () => {
    hooks.onLatestDate?.();
    document.querySelector('#dispatchCalendar')?.setAttribute('data-latest-date-clicked', 'true');
    const input = document.querySelector('#dispatchEnd') as HTMLInputElement | null;
    if (input) {
      input.value = getDispatchLatestTestDate().isoDate;
    }
  });
}

function renderTimePicker(
  today: ReturnType<typeof getTestToday>,
  onTimeClick?: (time: string) => void,
  mode: 'earliest' | 'latest' = 'earliest',
  options: {
    earliestTimeRect?: { left: number; top: number; width: number; height: number };
    latestTimeRect?: { left: number; top: number; width: number; height: number };
    earliestTimeParentMuted?: boolean;
    timeRequiresClickDetail?: boolean;
    earliestTimeClickIgnored?: boolean;
    onEarliestTimeMouseDown?: (event: MouseEvent) => void;
    onLatestTimeMouseDown?: (event: MouseEvent) => void;
  } = {},
): void {
  document.querySelector('#testTimePicker')?.remove();
  const earliestButtonStyle = options.earliestTimeParentMuted
    ? ' style="color: rgb(209, 213, 219)"'
    : '';
  const earliestSpanStyle = options.earliestTimeParentMuted
    ? ' style="color: rgb(17, 24, 39)"'
    : '';
  const optionsHtml =
    mode === 'earliest'
      ? `
        <button type="button" style="color: rgb(209, 213, 219)">0:00</button>
        <button type="button" style="color: rgb(209, 213, 219)">18:00</button>
        <button type="button"${earliestButtonStyle}><span id="testEarliestTimeButton"${earliestSpanStyle}>19:00</span></button>
        <button type="button">20:00</button>
      `
      : `
        <button type="button"><span id="testLatestTimeButton">18:59</span></button>
        <button type="button" style="color: rgb(209, 213, 219)">19:59</button>
        <button type="button" class="disabled">20:59</button>
        <button type="button" aria-disabled="true">23:59</button>
      `;
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="testTimePicker">
        <div>${today.year}.${String(today.month).padStart(2, '0')}.${String(today.day).padStart(2, '0')}.</div>
        ${optionsHtml}
      </div>
    `,
  );

  const earliestTimeButton = document.querySelector('#testEarliestTimeButton') as HTMLElement | null;
  const earliestTimeTarget = earliestTimeButton?.closest('button') as HTMLElement | null;
  if (earliestTimeTarget && options.earliestTimeRect) {
    earliestTimeTarget.getBoundingClientRect = () =>
      ({
        left: options.earliestTimeRect?.left ?? 0,
        top: options.earliestTimeRect?.top ?? 0,
        width: options.earliestTimeRect?.width ?? 0,
        height: options.earliestTimeRect?.height ?? 0,
        right: (options.earliestTimeRect?.left ?? 0) + (options.earliestTimeRect?.width ?? 0),
        bottom: (options.earliestTimeRect?.top ?? 0) + (options.earliestTimeRect?.height ?? 0),
        x: options.earliestTimeRect?.left ?? 0,
        y: options.earliestTimeRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  earliestTimeTarget?.addEventListener('mousedown', (event) => {
    options.onEarliestTimeMouseDown?.(event);
  });
  earliestTimeTarget?.addEventListener('click', (event) => {
    if (options.earliestTimeClickIgnored) {
      return;
    }
    if (options.timeRequiresClickDetail && event.detail < 1) {
      return;
    }
    onTimeClick?.('19:00');
    document.querySelector('#testTimePicker')?.remove();
  });
  const latestTimeButton = document.querySelector('#testLatestTimeButton') as HTMLElement | null;
  const latestTimeTarget = latestTimeButton?.closest('button') as HTMLElement | null;
  if (latestTimeTarget && options.latestTimeRect) {
    latestTimeTarget.getBoundingClientRect = () =>
      ({
        left: options.latestTimeRect?.left ?? 0,
        top: options.latestTimeRect?.top ?? 0,
        width: options.latestTimeRect?.width ?? 0,
        height: options.latestTimeRect?.height ?? 0,
        right: (options.latestTimeRect?.left ?? 0) + (options.latestTimeRect?.width ?? 0),
        bottom: (options.latestTimeRect?.top ?? 0) + (options.latestTimeRect?.height ?? 0),
        x: options.latestTimeRect?.left ?? 0,
        y: options.latestTimeRect?.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  latestTimeTarget?.addEventListener('mousedown', (event) => {
    options.onLatestTimeMouseDown?.(event);
  });
  latestTimeTarget?.addEventListener('click', () => {
    onTimeClick?.('18:59');
    document.querySelector('#testTimePicker')?.remove();
  });
}

function getTestToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  return {
    year,
    month,
    day,
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function getPreviousTestDate() {
  const today = getTestToday();
  const previous = new Date(today.year, today.month - 1, today.day - 1);
  const year = previous.getFullYear();
  const month = previous.getMonth() + 1;
  const day = previous.getDate();

  return {
    year,
    month,
    day,
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function getOneYearLaterTestDate() {
  const today = getTestToday();
  const targetYear = today.year + 1;
  const maxDay = new Date(targetYear, today.month, 0).getDate();
  const day = Math.min(today.day, maxDay);

  return {
    year: targetYear,
    month: today.month,
    day,
    isoDate: `${targetYear}-${String(today.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function getDispatchLatestTestDate() {
  const today = getTestToday();
  const base = new Date(today.year + 1, today.month - 1 + 3, 15);
  const year = base.getFullYear();
  const month = base.getMonth() + 1;
  const day = base.getDate();

  return {
    year,
    month,
    day,
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function createProduct() {
  return {
    id: ProductId.create('123456'),
    sourceScope: 'bundle-delivery-search-result' as const,
    sourceVerification: 'verified' as const,
  };
}

function createPlan(dryRun: boolean) {
  return {
    productId: ProductId.create('123456'),
    dryRun,
    targetScope: 'bundle-delivery-search-result' as const,
    requestedChanges: {
      productType: 'PREORDER' as const,
      orderPeriodEnd: `${getOneYearLaterTestDate().isoDate}T18:59`,
      postPreorderSaleStatus: 'ON_SALE' as const,
      dispatchCompletionDueDate: '2026-07-07T22:59',
      requiredOption: {
        enabled: true as const,
        type: 'SINGLE' as const,
        name: '해외 유통구조상 예약캔슬 불가',
        value: '동의합니다.',
      },
    },
    notes: [],
  };
}

function createRunPolicy() {
  return {
    dryRun: false,
    delayMs: 0,
    maxItems: 10,
    retryFailedOnly: false,
    resumeFromCheckpoint: true,
    stopOnConsecutiveFailures: 20,
    timezone: 'Asia/Seoul' as const,
  };
}

function createDriver(
  gateway = createGateway(),
  registry: SelectorRegistryPort = createRegistry(),
  trustedClick?: (point: { x: number; y: number }) => Promise<boolean>,
  pageTimeClick?: (input: { label: string; preference: 'earliest' | 'latest' }) => Promise<boolean>,
  pagePreorderDisclosureClick?: () => Promise<boolean>,
  pagePreorderEnabledClick?: () => Promise<boolean>,
) {
  return new ProductEditPageDriver(
    gateway,
    registry,
    createDateResolver(),
    document,
    window,
    trustedClick,
    pageTimeClick,
    pagePreorderDisclosureClick,
    pagePreorderEnabledClick,
  );
}

function createGateway(
  pageUrl = 'https://sell.smartstore.naver.com/#/products/edit?originProductNo=123456',
): SellerCenterPageGatewayPort {
  return {
    getPageTitle: () => '상품 수정',
    getPageUrl: () => pageUrl,
    isSellerCenterSurface: () => true,
    captureHtmlSnapshot: () => document.documentElement.outerHTML,
    getBodyText: () => document.body.textContent ?? '',
  };
}

function createDateResolver(): DateResolverPort {
  return {
    resolveMaximumAllowedDate: vi.fn(async ({ control }) => ({
      strategy: 'ui-max' as const,
      value:
        control === 'editor.orderPeriodControl'
          ? `${getOneYearLaterTestDate().isoDate}T19:59`
          : '2026-07-07T22:59',
      verificationStatus: 'verified' as const,
      note: `test max for ${control}`,
    })),
  };
}

function createRegistry(): SelectorRegistryPort {
  return {
    list(key) {
      const mapping: Partial<Record<Parameters<SelectorRegistryPort['list']>[0], string>> = {
        'editor.preorderSection': '#preorder',
        'editor.preorderProductOption': '#preorderType',
        'editor.normalProductOption': '#normalType',
        'editor.orderPeriodControl': '#orderPeriod',
        'editor.postPreorderStatusControl': '#postStatus',
        'editor.dispatchCompletionDateControl': '#dispatchDate',
        'editor.optionSection': '#optionSection',
        'editor.optionEnabledControl': '#optionEnabled',
        'editor.optionTypeControl': '#optionType',
        'editor.optionNameControl': '#optionName',
        'editor.optionValueControl': '#optionValue',
        'editor.saveButton': '#saveButton',
        'editor.successFeedback': '#successFeedback',
      };
      const selector = mapping[key];
      return selector
        ? [
            {
              key,
              strategy: 'css' as const,
              value: selector,
              priority: 1,
              fallback: false,
              verificationStatus: 'verified' as const,
              note: 'test selector',
            },
          ]
        : [];
    },
    keysForPageType() {
      return [];
    },
  };
}

function createCollapsedRegistry(): SelectorRegistryPort {
  return {
    list(key) {
      const mapping: Partial<Record<Parameters<SelectorRegistryPort['list']>[0], string>> = {
        'editor.preorderSection': '#reservation',
        'editor.preorderProductOption': '#preorderOn',
        'editor.normalProductOption': '#preorderOff',
        'editor.orderPeriodControl': '#orderPeriod',
        'editor.postPreorderStatusControl': '#postStatus',
        'editor.dispatchCompletionDateControl': '#dispatchDate',
        'editor.optionSection': '#optionSection',
        'editor.saveButton': '#saveButton',
        'editor.successFeedback': '#successFeedback',
      };
      const selector = mapping[key];
      return selector
        ? [
            {
              key,
              strategy: 'css' as const,
              value: selector,
              priority: 1,
              fallback: false,
              verificationStatus: 'verified' as const,
              note: 'collapsed test selector',
            },
          ]
        : [];
    },
    keysForPageType() {
      return [];
    },
  };
}

// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\product-edit-click-flow.ts
export interface UiOperationResult {
  ok: boolean;
  note: string;
}

export interface ProductEditRequiredOption {
  name: string;
  value: string;
}

export interface ProductEditClickFlowActions {
  openPreorderSection: () => Promise<UiOperationResult>;
  enablePreorder: () => Promise<UiOperationResult>;
  openOrderStartCalendar: () => Promise<UiOperationResult>;
  selectOrderStartCurrentDay: () => Promise<UiOperationResult>;
  selectOrderStartCurrentHour: () => Promise<UiOperationResult>;
  openOrderEndCalendar: () => Promise<UiOperationResult>;
  moveOrderEndOneYearForward: () => Promise<UiOperationResult>;
  selectOrderEndLastEnabledDay: () => Promise<UiOperationResult>;
  selectOrderEndLastEnabledHour: () => Promise<UiOperationResult>;
  selectAfterSaleStatusOn: () => Promise<UiOperationResult>;
  openDispatchCompletionCalendar: () => Promise<UiOperationResult>;
  moveDispatchCompletionOneYearForward: () => Promise<UiOperationResult>;
  moveDispatchCompletionThreeMonthsForward: () => Promise<UiOperationResult>;
  selectDispatchCompletionLastEnabledDay: () => Promise<UiOperationResult>;
  openOptionSection: () => Promise<UiOperationResult>;
  enableChoiceOption: () => Promise<UiOperationResult>;
  selectSimpleChoiceOptionType: () => Promise<UiOperationResult>;
  fillChoiceOptionName: (
    option: ProductEditRequiredOption,
    index: number,
  ) => Promise<UiOperationResult>;
  fillChoiceOptionValue: (
    option: ProductEditRequiredOption,
    index: number,
  ) => Promise<UiOperationResult>;
  applyChoiceOptionList: (
    option: ProductEditRequiredOption,
    index: number,
  ) => Promise<UiOperationResult>;
}

export interface ProductEditClickFlowStep {
  id: string;
  label: string;
  run: () => Promise<UiOperationResult>;
  blockedNote?: string;
}

export interface ProductEditClickFlowUnit {
  id: string;
  label: string;
  steps: readonly ProductEditClickFlowStep[];
}

export function createPreorderEditClickFlowUnits(
  actions: ProductEditClickFlowActions,
  requiredOptions: readonly ProductEditRequiredOption[],
): ProductEditClickFlowUnit[] {
  const optionSteps = requiredOptions.flatMap((option, index): ProductEditClickFlowStep[] => [
    {
      id: `required-option.${index}.name`,
      label: `옵션명 ${index + 1}`,
      run: () => actions.fillChoiceOptionName(option, index),
      blockedNote: `${index + 1}번째 필수 옵션의 직전 단계 실패로 옵션명 입력을 건너뛰었습니다.`,
    },
    {
      id: `required-option.${index}.value`,
      label: `옵션값 ${index + 1}`,
      run: () => actions.fillChoiceOptionValue(option, index),
      blockedNote: `${index + 1}번째 옵션명 입력 실패로 옵션값 입력을 건너뛰었습니다.`,
    },
    {
      id: `required-option.${index}.apply`,
      label: `옵션목록 적용 ${index + 1}`,
      run: () => actions.applyChoiceOptionList(option, index),
      blockedNote: `${index + 1}번째 옵션값 입력 실패로 옵션목록으로 적용 클릭을 건너뛰었습니다.`,
    },
  ]);

  return [
    {
      id: "preorder",
      label: "예약구매 설정",
      steps: [
        {
          id: "preorder.open",
          label: "예약구매 영역 열기",
          run: actions.openPreorderSection,
        },
        {
          id: "preorder.enable",
          label: "예약구매 설정함",
          run: actions.enablePreorder,
          blockedNote: "예약구매 영역 펼치기 실패로 예약구매 설정함 input 클릭을 건너뛰었습니다.",
        },
      ],
    },
    {
      id: "order-period",
      label: "주문기간",
      steps: [
        {
          id: "order-period.start-calendar",
          label: "주문 시작일 달력",
          run: actions.openOrderStartCalendar,
          blockedNote: "예약구매 설정함 input 클릭 실패로 주문 시작일 달력보기 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.start-day",
          label: "주문 시작일 현재 날짜",
          run: actions.selectOrderStartCurrentDay,
          blockedNote: "주문 시작일 달력보기 실패로 현재 날짜 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.start-hour",
          label: "주문 시작일 현재 시간",
          run: actions.selectOrderStartCurrentHour,
          blockedNote: "주문 시작일 현재 날짜 클릭 실패로 현재 시간 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.end-calendar",
          label: "주문 종료일 달력",
          run: actions.openOrderEndCalendar,
          blockedNote: "주문 시작일 현재 시간 클릭 실패로 주문기간 종료 달력보기 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.end-year-next",
          label: "주문 종료일 1년 뒤",
          run: actions.moveOrderEndOneYearForward,
          blockedNote: "주문기간 종료 달력보기 클릭 실패로 종료일 1년 뒤 버튼 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.end-day",
          label: "주문 종료일 마지막 활성 날짜",
          run: actions.selectOrderEndLastEnabledDay,
          blockedNote: "종료일 1년 뒤 버튼 클릭 실패로 종료일 마지막 활성 날짜 클릭을 건너뛰었습니다.",
        },
        {
          id: "order-period.end-hour",
          label: "주문 종료일 마지막 활성 시간",
          run: actions.selectOrderEndLastEnabledHour,
          blockedNote: "종료일 마지막 활성 날짜 클릭 실패로 종료일 마지막 활성 시간 클릭을 건너뛰었습니다.",
        },
      ],
    },
    {
      id: "after-sale-status",
      label: "기간 종료 후 상태",
      steps: [
        {
          id: "after-sale-status.on",
          label: "판매 중 상태",
          run: actions.selectAfterSaleStatusOn,
          blockedNote: "종료일 마지막 활성 시간 클릭 실패로 판매 중 상태 클릭을 건너뛰었습니다.",
        },
      ],
    },
    {
      id: "dispatch-completion",
      label: "발송완료일",
      steps: [
        {
          id: "dispatch-completion.calendar",
          label: "발송완료일 달력",
          run: actions.openDispatchCompletionCalendar,
          blockedNote: "판매 중 상태 클릭 실패로 발송완료일 달력보기 클릭을 건너뛰었습니다.",
        },
        {
          id: "dispatch-completion.year-next",
          label: "발송완료일 1년 뒤",
          run: actions.moveDispatchCompletionOneYearForward,
          blockedNote: "발송완료일 달력보기 클릭 실패로 발송완료일 오른쪽 이중 화살표 클릭을 건너뛰었습니다.",
        },
        {
          id: "dispatch-completion.month-next",
          label: "발송완료일 3개월 뒤",
          run: actions.moveDispatchCompletionThreeMonthsForward,
          blockedNote: "발송완료일 오른쪽 이중 화살표 클릭 실패로 발송완료일 오른쪽 한 개 화살표 3회 클릭을 건너뛰었습니다.",
        },
        {
          id: "dispatch-completion.day",
          label: "발송완료일 마지막 활성 날짜",
          run: actions.selectDispatchCompletionLastEnabledDay,
          blockedNote: "발송완료일 오른쪽 한 개 화살표 3회 클릭 실패로 발송완료일 마지막 활성 날짜 클릭을 건너뛰었습니다.",
        },
      ],
    },
    {
      id: "required-option",
      label: "필수 옵션",
      steps: [
        {
          id: "required-option.open",
          label: "옵션 영역 열기",
          run: actions.openOptionSection,
          blockedNote: "발송완료일 마지막 활성 날짜 클릭 실패로 메뉴토글 클릭을 건너뛰었습니다.",
        },
        {
          id: "required-option.enable-choice",
          label: "선택형 설정함",
          run: actions.enableChoiceOption,
          blockedNote: "메뉴토글 클릭 실패로 선택형 설정함 input 클릭을 건너뛰었습니다.",
        },
        {
          id: "required-option.simple-type",
          label: "단독형",
          run: actions.selectSimpleChoiceOptionType,
          blockedNote: "선택형 설정함 input 클릭 실패로 단독형 input 클릭을 건너뛰었습니다.",
        },
        ...optionSteps,
      ],
    },
  ];
}

export async function runProductEditClickFlow(
  units: readonly ProductEditClickFlowUnit[],
): Promise<UiOperationResult[]> {
  const results: UiOperationResult[] = [];

  for (const unit of units) {
    for (const step of unit.steps) {
      const previous = results.at(-1);
      if (previous && !previous.ok) {
        results.push({
          ok: false,
          note: step.blockedNote ?? `${unit.label} > ${step.label} 단계를 건너뛰었습니다.`,
        });
        continue;
      }

      results.push(await step.run());
    }
  }

  return results;
}

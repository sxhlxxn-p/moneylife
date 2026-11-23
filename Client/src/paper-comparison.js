function installPaperComparison(paper) {
  paper.compareSavedPlans = async function () {
    if (!paper.available() || !paper.current) return;
    const reference = paper.current.plan;
    const selected = new Map([[reference.id, reference]]);
    show(
      '<div id="papercompare"><div class="eyebrow">같은 출발점, 다른 선택</div><h2>어떤 사본을 비교할까요?</h2><p>현재 사본을 기준으로 최대 두 사본을 더 선택해요. 모두 진행한 시점까지만 비교하며 다음 달로 자동 진행하지 않아요.</p><p id="papercompare-status" role="status"></p><div id="papercompare-list" class="saved-plans"></div><div id="papercompare-pages" class="paper-toolbar"></div><div id="papercompare-actions" class="modalactions"></div></div>',
    );
    const container = $("papercompare");
    const status = $("papercompare-status");
    const compareButton = paper.button("선택한 사본 비교", execute, true, true);
    $("papercompare-actions").append(
      paper.button("닫기", closeModal),
      compareButton,
    );
    async function page(offset = 0) {
      if (!paper.available()) return;
      setPlanBusy(true);
      status.textContent = "저장한 사본을 불러오는 중이에요.";
      try {
        const plans = await apiRequest(
          "paper-plans",
          `?limit=20&offset=${offset}`,
        );
        if (!container.isConnected || $("overlay").classList.contains("hidden"))
          return;
        const list = $("papercompare-list");
        list.replaceChildren();
        list.append(
          paper.node(
            "p",
            `기준: ${reference.name} · 현재 ${reference.month}개월차.`,
          ),
        );
        for (const plan of plans) {
          const compatible =
            plan.financialPlanId === reference.financialPlanId &&
            plan.source.priceDataHash === reference.source.priceDataHash;
          const label = paper.node("label", undefined, "paper-compare-choice");
          const checkbox = paper.node("input");
          checkbox.type = "checkbox";
          checkbox.value = plan.id;
          checkbox.checked = selected.has(plan.id);
          checkbox.disabled = plan.id === reference.id || !compatible;
          checkbox.dataset.planAction = "paper-comparison-choice";
          checkbox.dataset.paperDisabled = String(checkbox.disabled);
          const description = paper.node(
            "span",
            `${plan.name} · ${plan.month}개월${plan.id === reference.id ? " · 기준 사본" : ""}${plan.action === "conditions" ? " · 생활 조건 변경" : plan.action === "cancel" ? " · 주문 취소" : ""} · ${new Date(plan.createdAt / 1000).toLocaleString("ko-KR")}`,
          );
          if (!compatible)
            description.append(
              paper.node(
                "small",
                "출발 조건 또는 가격 버전이 달라 비교할 수 없어요.",
              ),
            );
          label.append(checkbox, description);
          list.append(label);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked && selected.size >= 3) {
              checkbox.checked = false;
              status.textContent =
                "기준 사본을 포함해 최대 세 사본까지 비교할 수 있어요.";
              return;
            }
            if (checkbox.checked) selected.set(plan.id, plan);
            else selected.delete(plan.id);
            status.textContent = `현재 ${selected.size}개 선택 · 기준 포함 2~3개를 선택해주세요.`;
            compareButton.dataset.paperDisabled = String(selected.size < 2);
            compareButton.disabled = serverPlanBusy || selected.size < 2;
          });
        }
        const pages = $("papercompare-pages");
        pages.replaceChildren();
        if (offset > 0)
          pages.append(
            paper.button("이전 목록", () => page(Math.max(0, offset - 20))),
          );
        if (plans.length === 20)
          pages.append(paper.button("다음 목록", () => page(offset + 20)));
        status.textContent = `현재 ${selected.size}개 선택 · 기준 포함 2~3개를 선택해주세요.`;
      } catch (error) {
        if (container.isConnected) status.textContent = error.message;
      } finally {
        setPlanBusy(false);
      }
    }
    async function execute() {
      if (!paper.available() || selected.size < 2 || selected.size > 3) return;
      setPlanBusy(true);
      status.textContent = "공통 시점의 저장 결과를 비교하는 중이에요.";
      try {
        const result = await apiRequest("paper-comparisons", "", {
          method: "POST",
          body: JSON.stringify({
            planIds: [...selected.keys()],
          }),
        });
        if (!container.isConnected || $("overlay").classList.contains("hidden"))
          return;
        container.replaceChildren(
          paper.node("div", "저장한 사본 비교", "eyebrow"),
          paper.node(
            "h2",
            `${result.throughMonth}개월까지의 선택을 비교했어요`,
          ),
          paper.node(
            "p",
            `주가 기준 ${paper.marketDate(result.source, result.throughMonth)}. 모두 진행한 구간만 보여줘요. 아직 지나지 않은 월은 계산하거나 표시하지 않았어요.`,
          ),
        );
        const cards = paper.node("div", undefined, "paper-branch-cards");
        for (const [index, path] of result.paths.entries()) {
          const card = paper.node("article");
          const summary = path.summary;
          card.append(
            paper.node(
              "h3",
              `${String.fromCharCode(65 + index)} · ${index ? "비교 사본" : "기준 사본"}`,
            ),
            paper.node("p", `${path.name} · 저장 시점 ${path.savedMonth}개월`),
            paper.node("strong", paper.won(summary.finalNetAssets)),
            paper.node(
              "p",
              `현금 ${paper.won(summary.finalCash)} · 저축 ${paper.won(summary.finalSaved)} · 주식 ${paper.won(summary.finalInvestmentValue)}`,
            ),
            paper.node(
              "p",
              `목표 최초 달성: ${summary.goalMonth === null ? "공통 구간 내 아직 미달성" : paper.goal(summary.goalMonth)}`,
            ),
            paper.node(
              "p",
              `현금 부족 ${summary.shortageMonths}개월 · 미충족 ${paper.won(summary.unmetTotal)}`,
            ),
          );
          if (index) {
            const diff = result.differences[index - 1];
            card.append(
              paper.node(
                "p",
                `A 대비 순자산 ${paper.signed(diff.finalAssetsDifference)}`,
              ),
              paper.node(
                "p",
                diff.goalMonthDifference === null
                  ? "두 사본이 모두 목표에 도달한 뒤 목표 월 차이를 비교할 수 있어요."
                  : `A 대비 목표 최초 달성 ${diff.goalMonthDifference > 0 ? "+" : ""}${diff.goalMonthDifference}개월 차이`,
              ),
            );
          }
          cards.append(card);
        }
        container.append(
          cards,
          paper.branchChart(result.paths, result.throughMonth),
          paper.node(
            "p",
            "조건 변경 효과를 보려면 각 사본을 변경이 적용되는 월까지 직접 진행한 뒤 비교해주세요. 비교 때문에 현재 사본이나 거래 기록은 바뀌지 않아요.",
            "paper-caption",
          ),
          paper.button("다른 사본 선택", () => paper.compareSavedPlans()),
          paper.button("비교 닫기", closeModal),
        );
      } catch (error) {
        if (container.isConnected) status.textContent = error.message;
      } finally {
        setPlanBusy(false);
      }
    }
    await page();
  };
}

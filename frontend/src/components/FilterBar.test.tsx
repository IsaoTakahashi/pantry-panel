import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FilterCondition } from "@/lib/filterStockItems";
import FilterBar from "./FilterBar";

const baseValue: FilterCondition = {
  searchText: "",
  wantToBuyOnly: false,
  category: null,
};

describe("FilterBar", () => {
  it("検索テキストを入力すると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("searchbox"), "醤");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      searchText: "醤",
    });
  });

  it("クリアボタンをクリックすると検索テキストが空になり onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={{ ...baseValue, searchText: "醤油" }}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "クリア" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      searchText: "",
    });
  });

  it("検索テキストが空のときクリアボタンは表示されない", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "クリア" }),
    ).not.toBeInTheDocument();
  });

  it("「買いたいものだけ」チェックボックスをクリックすると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "買いたいものだけ" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      wantToBuyOnly: true,
    });
  });

  it("カテゴリを選択すると onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("カテゴリ"), "調味料");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      category: "調味料",
    });
  });

  it("全部を選択すると、カテゴリが null になり onChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        value={{ ...baseValue, category: "調味料" }}
        onChange={onChange}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("カテゴリ"), "全部");
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseValue,
      category: null,
    });
  });
});

describe("FilterBar 表示モードトグル", () => {
  it("role='radiogroup' と aria-label='表示モード' を持つ親要素が存在する", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "表示モード" }),
    ).toBeInTheDocument();
  });

  it("初期 viewMode='normal' のとき「通常」が aria-checked=true、「シンプル」が aria-checked=false", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "通常" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "シンプル" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("viewMode='simple' のとき「シンプル」が aria-checked=true、「通常」が aria-checked=false", () => {
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="simple"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "シンプル" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "通常" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("「シンプル」をクリックすると onViewModeChange('simple') が呼ばれる", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="normal"
        onViewModeChange={onViewModeChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "シンプル" }));
    expect(onViewModeChange).toHaveBeenCalledWith("simple");
  });

  it("viewMode='simple' で「通常」をクリックすると onViewModeChange('normal') が呼ばれる", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        value={baseValue}
        onChange={vi.fn()}
        viewMode="simple"
        onViewModeChange={onViewModeChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "通常" }));
    expect(onViewModeChange).toHaveBeenCalledWith("normal");
  });
});

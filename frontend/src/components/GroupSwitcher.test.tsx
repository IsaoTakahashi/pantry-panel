import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GroupInfo } from "@/types/group";
import GroupSwitcher from "./GroupSwitcher";

const groups: GroupInfo[] = [
  { groupId: "g1", name: "我が家", role: "owner" },
  { groupId: "g2", name: "実家", role: "member" },
];

describe("GroupSwitcher", () => {
  it("shows active group name in trigger button", () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /我が家/ })).toBeInTheDocument();
  });

  it("opens dropdown and shows all groups on click", async () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    expect(screen.getByText("実家")).toBeInTheDocument();
    expect(screen.getByText("新しいグループを作成")).toBeInTheDocument();
  });

  it("calls onSwitch when a non-active group is clicked", async () => {
    const onSwitch = vi.fn();
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={onSwitch}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByText("実家"));
    expect(onSwitch).toHaveBeenCalledWith("g2");
  });

  it("shows text input when owner clicks active group name to rename", async () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByTestId("group-name-g1"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onRenameGroup on Enter with new name", async () => {
    const onRenameGroup = vi.fn().mockResolvedValue(undefined);
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={onRenameGroup}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByTestId("group-name-g1"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "新しい名前");
    await userEvent.keyboard("{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("g1", "新しい名前");
  });

  it("shows input and calls onCreateGroup on Enter", async () => {
    const onCreateGroup = vi.fn().mockResolvedValue(undefined);
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={onCreateGroup}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByText("新しいグループを作成"));
    const input = screen.getByPlaceholderText("グループ名");
    await userEvent.type(input, "新グループ");
    await userEvent.keyboard("{Enter}");
    expect(onCreateGroup).toHaveBeenCalledWith("新グループ");
  });
});

import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, type ModalSize } from "../Modal";
import { Button } from "../Button";

function Harness({
  size,
  dirty = false,
  dismissible = true,
  onClose = () => {},
}: {
  size?: ModalSize;
  dirty?: boolean;
  dismissible?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Modal
        open={open}
        title="Adjust stock"
        size={size}
        dirty={dirty}
        dismissible={dismissible}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={({ requestClose }) => (
          <Button variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
        )}
      >
        <input aria-label="Quantity" />
      </Modal>
    </>
  );
}

async function openDialog() {
  const opener = screen.getByRole("button", { name: "Open dialog" });
  await userEvent.click(opener);
  return {
    opener,
    dialog: screen.getByRole("dialog", { name: "Adjust stock" }),
  };
}

describe("Modal", () => {
  it.each([
    ["small", "md:max-w-[440px]"],
    ["medium", "md:max-w-[640px]"],
    ["md", "md:max-w-[440px]"],
    ["lg", "md:max-w-[440px]"],
    ["xl", "md:max-w-[520px]"],
  ] as const)(
    "size %s renders at %s on desktop and as a full-screen sheet below 768px",
    async (size, width) => {
      render(<Harness size={size} />);
      const { dialog } = await openDialog();
      expect(dialog).toHaveAttribute("data-size", size);
      expect(dialog.className).toContain(width);
      expect(dialog.className).toContain("md:rounded-dialog");
      // Mobile-first: full width/height with no radius until the md breakpoint.
      expect(dialog.className).toMatch(/(^| )h-full( |$)/);
      expect(dialog.className).toContain("rounded-none");
    },
  );

  it("defaults to the small (440px) width for existing callers", async () => {
    render(<Harness />);
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute("data-size", "md");
    expect(dialog.className).toContain("md:max-w-[440px]");
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { opener, dialog } = await openDialog();
    await userEvent.click(
      within(dialog).getByRole("textbox", { name: "Quantity" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on ✕ and returns focus to the opener", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { opener, dialog } = await openDialog();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes on a backdrop click", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { dialog } = await openDialog();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape, ✕ and the backdrop while not dismissible", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissible={false} />);
    const { dialog } = await openDialog();
    await userEvent.click(
      within(dialog).getByRole("textbox", { name: "Quantity" }),
    );
    await userEvent.keyboard("{Escape}");
    fireEvent.click(dialog);
    expect(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    ).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Adjust stock" }),
    ).toBeInTheDocument();
  });

  it("leaves Escape alone when an inner widget already handled it", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { dialog } = await openDialog();
    const input = within(dialog).getByRole("textbox", { name: "Quantity" });
    input.addEventListener("keydown", (event) => event.preventDefault());
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("with unsaved changes (dirty)", () => {
    it.each([
      [
        "Escape",
        async (dialog: HTMLElement) => {
          await userEvent.click(
            within(dialog).getByRole("textbox", { name: "Quantity" }),
          );
          await userEvent.keyboard("{Escape}");
        },
      ],
      [
        "✕",
        (dialog: HTMLElement) =>
          userEvent.click(
            within(dialog).getByRole("button", { name: "Close dialog" }),
          ),
      ],
      ["the backdrop", (dialog: HTMLElement) => fireEvent.click(dialog)],
      [
        "Cancel (requestClose)",
        (dialog: HTMLElement) =>
          userEvent.click(
            within(dialog).getByRole("button", { name: "Cancel" }),
          ),
      ],
    ] as const)(
      '%s asks "Discard unsaved changes?" instead of closing',
      async (_label, attemptClose) => {
        const onClose = vi.fn();
        render(<Harness onClose={onClose} dirty />);
        const { dialog } = await openDialog();
        await attemptClose(dialog);
        expect(onClose).not.toHaveBeenCalled();
        const confirm = within(dialog).getByRole("alertdialog", {
          name: "Discard unsaved changes?",
        });
        expect(
          within(confirm).getByRole("button", { name: "Keep editing" }),
        ).toHaveFocus();
      },
    );

    it("Keep editing keeps the dialog open and hides the confirm", async () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} dirty />);
      const { dialog } = await openDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Close dialog" }),
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Keep editing" }),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(within(dialog).queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("Escape on the confirm means keep editing", async () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} dirty />);
      const { dialog } = await openDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Close dialog" }),
      );
      await userEvent.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
      expect(within(dialog).queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("Discard closes the dialog and returns focus to the opener", async () => {
      const onClose = vi.fn();
      render(<Harness onClose={onClose} dirty />);
      const { opener, dialog } = await openDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Discard" }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  });
});

describe("Modal and the native close event", () => {
  /** Real browsers queue the `close` event as a task; the jsdom shim fires it synchronously. */
  function asyncNativeClose() {
    return vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    });
  }

  it("stays open under React.StrictMode (effect re-run closes and reopens) and does not call onClose", async () => {
    asyncNativeClose();
    const onClose = vi.fn();
    // Mounted already open, like the app's dialogs ({adjusting ? <AdjustStockDialog /> : null}).
    render(
      <StrictMode>
        <Modal open title="Adjust stock" onClose={onClose}>
          <input aria-label="Quantity" />
        </Modal>
      </StrictMode>,
    );
    const dialog = screen.getByRole("dialog", { name: "Adjust stock" });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "Adjust stock" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["synchronous (jsdom shim)", false],
    ["queued (browser)", true],
  ] as const)("a close the browser does by itself calls onClose exactly once — %s event", async (_label, queued) => {
    if (queued) asyncNativeClose();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { dialog } = await openDialog();
    await act(async () => {
      (dialog as HTMLDialogElement).close();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closing from the owner (Cancel) calls onClose exactly once", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

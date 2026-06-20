import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cmd } from "@/lib/commands";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: "r",
      ctrl: true,
      action: () => {
        window.location.reload();
      },
      description: "刷新页面 (Ctrl+R)",
    },
    {
      key: "Escape",
      action: () => {
        document.body.classList.remove("modal-open");
      },
      description: "关闭弹窗 (Esc)",
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch
        ) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

export function useQuickRefresh(onRefresh: () => void) {
  const handleRefresh = useCallback(() => {
    onRefresh();
    toast.info("正在刷新数据...", { duration: 1000 });
  }, [onRefresh]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "F5") {
        event.preventDefault();
        handleRefresh();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleRefresh]);
}

export function useMiniWindowToggle() {
  const toggleMiniWindow = useCallback(async () => {
    try {
      const state = await cmd.getWindowModeState();
      await cmd.setMiniWindowMode(!state.mini_mode);
    } catch {
      toast.error("切换小窗口失败");
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMiniWindow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleMiniWindow]);
}

"use client";

import { cn } from "@/lib/cn";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type Dispatch,
  type HTMLAttributes,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuId: string;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error("Menu components must be used within Menu");
  }
  return ctx;
}

export type MenuProps = {
  children: ReactNode;
};

export function Menu({ children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    }
  }, [open]);

  return (
    <MenuContext.Provider
      value={{ open, setOpen, menuId, activeIndex, setActiveIndex, triggerRef }}
    >
      <div className="relative inline-block text-left">{children}</div>
    </MenuContext.Provider>
  );
}

export const MenuTrigger = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function MenuTrigger({ className, onClick, ...props }, ref) {
  const { open, setOpen, menuId, triggerRef } = useMenuContext();

  return (
    <button
      ref={(node) => {
        triggerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      className={cn(
        "inline-flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink hover:bg-page",
        className,
      )}
      onClick={(event) => {
        setOpen(!open);
        onClick?.(event);
      }}
      {...props}
    />
  );
});

export type MenuPanelProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
};

export const MenuPanel = forwardRef<HTMLDivElement, MenuPanelProps>(
  function MenuPanel({ label, className, children, ...props }, ref) {
    const { open, setOpen, menuId, activeIndex, setActiveIndex, triggerRef } =
      useMenuContext();
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    function getItems() {
      if (!listRef.current) {
        return [] as HTMLButtonElement[];
      }
      return Array.from(
        listRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      );
    }

    useEffect(() => {
      if (!open) {
        return;
      }
      const items = getItems();
      items[activeIndex]?.focus();
    }, [open, activeIndex]);

    useEffect(() => {
      if (!open) {
        return;
      }
      function onPointerDown(event: MouseEvent) {
        const target = event.target as Node;
        if (panelRef.current?.contains(target)) {
          return;
        }
        setOpen(false);
      }
      function onDocumentKeyDown(event: globalThis.KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onDocumentKeyDown);
      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onDocumentKeyDown);
      };
    }, [open, setOpen, triggerRef]);

    if (!open) {
      return null;
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      const items = getItems();
      const count = items.length;
      if (count === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % count);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + count) % count);
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(count - 1);
      }
    }

    return (
      <div
        ref={(node) => {
          panelRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        id={menuId}
        role="presentation"
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute right-0 z-40 mt-2 min-w-[12rem] rounded-xl border border-border bg-white p-2 shadow-card",
          className,
        )}
        {...props}
      >
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        <ul ref={listRef} role="menu" aria-label={label} className="mt-1 list-none">
          {children}
        </ul>
      </div>
    );
  },
);

export type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
  function MenuItem({ active, className, onClick, onFocus, ...props }, ref) {
    const { setOpen, setActiveIndex, triggerRef } = useMenuContext();

    return (
      <li role="none">
        <button
          ref={ref}
          type="button"
          role="menuitem"
          className={cn(
            "flex min-h-touch w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            active ? "bg-accent-tint text-accent" : "",
            className,
          )}
          onClick={(event) => {
            setOpen(false);
            triggerRef.current?.focus();
            onClick?.(event);
          }}
          onFocus={(event) => {
            const list = event.currentTarget.closest("ul");
            if (list) {
              const items = Array.from(
                list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
              );
              const index = items.indexOf(event.currentTarget);
              if (index >= 0) {
                setActiveIndex(index);
              }
            }
            onFocus?.(event);
          }}
          {...props}
        />
      </li>
    );
  },
);

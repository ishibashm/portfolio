import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import Link from "next/link";
import { coreRouteLabel } from "@/lib/siteStructure";
import {
  chooseBubblePlacement,
  collectBubbleBlockers,
} from "./shirubeBubblePlace";

const ARBITRAGE_HREF = "/relocation/arbitrage";

const MENU_LINKS = [
  { href: "/houi/today", label: "今日の方位" },
  // 道具の名前は CORE_ROUTES が正。字面を写さず coreRouteLabel で引く。
  {
    href: ARBITRAGE_HREF,
    label: coreRouteLabel(ARBITRAGE_HREF) ?? ARBITRAGE_HREF,
  },
  { href: "/blog", label: "ブログ" },
  { href: "/annai", label: "しるべに案内してもらう" },
];

interface ShirubeMenuProps {
  trigger: HTMLButtonElement;
  viewportWidth: () => number;
  onClose: () => void;
  onTip: () => void;
  onReturnHome: () => void;
}

export function ShirubeMenu({
  trigger,
  viewportWidth,
  onClose,
  onTip,
  onReturnHome,
}: ShirubeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const place = () => {
      const actor = trigger.getBoundingClientRect();
      const width = viewportWidth();
      menu.style.maxWidth = `${Math.max(0, width - 16)}px`;
      const size = menu.getBoundingClientRect();
      const { left, top } = chooseBubblePlacement(
        {
          x: actor.left,
          y: actor.bottom,
          actorWidth: actor.width,
          actorHeight: actor.height,
          viewportWidth: width,
          viewportHeight: window.innerHeight,
        },
        { width: size.width, height: size.height },
        [...collectBubbleBlockers(), actor],
      );
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menu.contains(target) &&
        !trigger.contains(target)
      ) {
        onClose();
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    place();
    menu
      .querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", place);
    };
  }, [onClose, trigger, viewportWidth]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = items.findIndex((item) => item === document.activeElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = (index + 1) % items.length;
        break;
      case "ArrowUp":
        next = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      case "Tab":
        next =
          (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        break;
      case " ":
        if (items[index] instanceof HTMLAnchorElement) {
          event.preventDefault();
          items[index].click();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className="shirube-menu"
      role="menu"
      aria-label="しるべのメニュー"
      onKeyDown={onKeyDown}
    >
      {MENU_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} role="menuitem" onClick={onClose}>
          {label}
        </Link>
      ))}
      <button type="button" role="menuitem" onClick={onTip}>
        ひとこと案内
      </button>
      <button type="button" role="menuitem" onClick={onReturnHome}>
        定位置に戻る
      </button>
    </div>
  );
}

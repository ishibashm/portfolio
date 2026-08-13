import type { MouseEvent } from "react";

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
  size?: "sm" | "md";
}

/** 一覧の中で直接押せるお気に入りボタン。親の詳細表示クリックとは分離する。 */
export function FavoriteButton({
  isFavorite,
  onToggle,
  className = "",
  size = "sm",
}: FavoriteButtonProps) {
  const label = isFavorite ? "お気に入りから外す" : "お気に入りに追加";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded-full leading-none transition-colors ${
        size === "md" ? "w-7 h-7 text-base" : "w-6 h-6 text-sm"
      } ${
        isFavorite
          ? "bg-amber-100 text-amber-500 hover:bg-amber-200"
          : "bg-gray-100 dark:bg-white text-stone-400 hover:bg-gray-200 hover:text-amber-500"
      } ${className}`}
    >
      {isFavorite ? "★" : "☆"}
    </button>
  );
}

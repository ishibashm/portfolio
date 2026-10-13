"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

const TOTAL_SLIDES = 14;

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, TOTAL_SLIDES));
  }, []);

  const goToPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 1));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [goToNext, goToPrev, toggleFullscreen]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#000",
        position: "relative",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          cursor: currentSlide < TOTAL_SLIDES ? "pointer" : "default",
        }}
        onClick={goToNext}
      >
        <Image
          src={`/slides/slide-${String(currentSlide).padStart(2, "0")}.png`}
          alt={`スライド ${currentSlide}`}
          width={2001}
          height={1125}
          priority
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </div>

      <div
        style={{
          padding: "1rem",
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            disabled={currentSlide === 1}
            style={{
              padding: "0.5rem 1rem",
              background: currentSlide === 1 ? "#333" : "#555",
              color: currentSlide === 1 ? "#666" : "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: currentSlide === 1 ? "not-allowed" : "pointer",
              fontSize: "1rem",
            }}
          >
            ◀ 前へ
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            disabled={currentSlide === TOTAL_SLIDES}
            style={{
              padding: "0.5rem 1rem",
              background: currentSlide === TOTAL_SLIDES ? "#333" : "#555",
              color: currentSlide === TOTAL_SLIDES ? "#666" : "#fff",
              border: "none",
              borderRadius: "4px",
              cursor:
                currentSlide === TOTAL_SLIDES ? "not-allowed" : "pointer",
              fontSize: "1rem",
            }}
          >
            次へ ▶
          </button>
          <span style={{ fontSize: "1rem", marginLeft: "0.5rem" }}>
            {currentSlide} / {TOTAL_SLIDES}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            style={{
              padding: "0.5rem 1rem",
              background: "#555",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            {isFullscreen ? "全画面を終了" : "全画面表示"}
          </button>
          <a
            href="/presentation.pptx"
            download="最近のあれこれ_v3.pptx"
            style={{
              padding: "0.5rem 1rem",
              background: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              textDecoration: "none",
              fontSize: "1rem",
              display: "inline-block",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            PPTXをダウンロード
          </a>
        </div>
      </div>
    </div>
  );
}

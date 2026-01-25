"use client";

import React, { useEffect, useRef } from "react";

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let offset = 0;
    const speed = 1; // グリッドの移動速度
    const gridSpacing = 40; // グリッドの間隔

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    const draw = () => {
      // 背景クリア（少し透明度を残してトレイル効果を出してもいいが、今回はクリア）
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      // 上部のグラデーション（空）
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#000000");
      gradient.addColorStop(0.5, "#0f0518"); // 少し紫
      gradient.addColorStop(1, "#1a0b2e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // グリッド描画設定
      ctx.strokeStyle = "rgba(0, 243, 255, 0.3)"; // Cyan
      ctx.lineWidth = 1;

      // 3D効果のためのパラメータ
      const horizonY = height * 0.3; // 地平線の位置（画面上部寄り）
      const maxZ = 1000; // 奥行きの最大値

      // 縦線（Z軸方向）
      // 中央から左右に広がるように描画
      const centerX = width / 2;
      const fov = 300; // 視野角的な係数

      ctx.beginPath();
      // 地平線
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      
      // 放射状の線
      for (let i = -20; i <= 20; i++) {
        // x位置を計算
        // 画面下端(z=0)でのx座標
        const xBottom = centerX + i * gridSpacing * 4; 
        
        ctx.moveTo(centerX, horizonY);
        ctx.lineTo(xBottom, height);
      }
      ctx.stroke();

      // 横線（X軸方向） - 手前に向かって動く
      offset = (offset + speed) % gridSpacing;

      // 奥行き方向のループ
      // zは0(手前)からmaxZ(奥)まで、あるいはその逆
      // 画面下部を大きく、上部（地平線）に向かって小さく描画するアプローチ
      // シンプルなパースペクティブ：y = horizonY + (height - horizonY) / z
      
      // 今回は簡易的な走査線アニメーション
      // 下から上へ（地平線へ）動く線
      
      const linesCount = 20;
      for(let i=0; i < linesCount; i++) {
         // 画面上のY座標を計算する。
         // 線は指数関数的に配置すると奥行きが出る
         
         // tは0(地平線)〜1(画面下端)
         // 時間経過でtを変化させる
         
         // ベースの位置 + オフセット
         // i番目の線の進行度 (0.0 - 1.0)
         let progress = (i * gridSpacing + offset) / (linesCount * gridSpacing);
         if (progress > 1) progress -= 1;
         
         // パースペクティブ変換: 手前ほど間隔が広く、奥ほど狭い
         // y = horizonY + (height - horizonY) * (progress^2) など
         // progress=0 -> horizonY, progress=1 -> height
         
         const y = horizonY + (height - horizonY) * Math.pow(progress, 3);
         
         // 線の太さや透明度も距離に応じて変える
         const alpha = progress * 0.5;
         ctx.strokeStyle = `rgba(255, 0, 255, ${alpha})`; // Magenta
         ctx.lineWidth = 1 + progress * 2;
         
         ctx.beginPath();
         ctx.moveTo(0, y);
         ctx.lineTo(width, y);
         ctx.stroke();
      }
      
      // グロー効果（全体にうっすら）
      // パフォーマンス注意だが、サイバーパンク感には重要
      
      requestAnimationFrame(draw);
    };

    const animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10"
    />
  );
}

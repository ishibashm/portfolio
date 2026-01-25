"use client";

import React, { useRef, useEffect } from "react";

const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const particleCount = 100;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Particle Class
    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      alpha: number;
      pulseSpeed: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 0.5; // Small particles
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * -1 - 0.2; // Move upwards
        
        // Golden/Magic colors
        const colors = ["#FDB931", "#F5D061", "#E1AD01", "#FFFFFF"];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        
        this.alpha = Math.random() * 0.5 + 0.2;
        this.pulseSpeed = Math.random() * 0.02 + 0.005;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Reset if out of bounds
        if (this.y < 0) {
          this.y = canvas!.height;
          this.x = Math.random() * canvas!.width;
        }
        if (this.x < 0 || this.x > canvas!.width) {
          this.speedX *= -1;
        }

        // Pulse effect
        this.alpha += this.pulseSpeed;
        if (this.alpha > 0.8 || this.alpha < 0.2) {
          this.pulseSpeed *= -1;
        }
      }

      draw() {
        if (!ctx) return;
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
      }
    }

    // Init particles
    const init = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };
    init();

    // Animation Loop
    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((p) => {
        p.update();
        p.draw();
      });

      // Spiral/Flow lines (optional decoration)
      // ctx.strokeStyle = 'rgba(253, 185, 49, 0.05)';
      // ctx.lineWidth = 1;
      // ctx.beginPath();
      // ctx.moveTo(canvas.width / 2, canvas.height);
      // ctx.bezierCurveTo(canvas.width / 2, canvas.height / 2, canvas.width, 0, canvas.width, 0);
      // ctx.stroke();

      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      style={{ background: "transparent" }} // Let parent handle background color
    />
  );
};

export default ParticleBackground;

'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="fixed w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
                    MyPortfolio
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex gap-8 items-center">
                    <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Home</Link>
                    <Link href="/portfolio" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Portfolio</Link>
                    <Link href="/blog" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Blog</Link>
                </nav>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden text-gray-300 hover:text-white"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isMenuOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile Nav */}
            {isMenuOpen && (
                <nav className="md:hidden bg-black border-t border-white/10 py-4 px-4 flex flex-col gap-4">
                    <Link
                        href="/"
                        className="text-gray-300 hover:text-white transition-colors block py-2"
                        onClick={() => setIsMenuOpen(false)}
                    >
                        Home
                    </Link>
                    <Link
                        href="/portfolio"
                        className="text-gray-300 hover:text-white transition-colors block py-2"
                        onClick={() => setIsMenuOpen(false)}
                    >
                        Portfolio
                    </Link>
                    <Link
                        href="/blog"
                        className="text-gray-300 hover:text-white transition-colors block py-2"
                        onClick={() => setIsMenuOpen(false)}
                    >
                        Blog
                    </Link>
                </nav>
            )}
        </header>
    );
}

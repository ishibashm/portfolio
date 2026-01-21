import Link from 'next/link';
import { FaGithub, FaTwitter, FaLinkedin } from 'react-icons/fa';

export default function Footer() {
    return (
        <footer className="bg-black border-t border-white/10 pt-16 pb-8">
            <div className="max-w-6xl mx-auto px-4">
                <div className="grid md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-2">
                        <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4 inline-block">
                            MyPortfolio
                        </Link>
                        <p className="text-gray-400 max-w-sm leading-relaxed">
                            Crafting digital experiences with passion and precision.
                            Let's build something amazing together.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-white mb-4">Navigation</h3>
                        <ul className="space-y-2">
                            <li><Link href="/" className="text-gray-400 hover:text-indigo-400 transition-colors">Home</Link></li>
                            <li><Link href="/portfolio" className="text-gray-400 hover:text-indigo-400 transition-colors">Portfolio</Link></li>
                            <li><Link href="/blog" className="text-gray-400 hover:text-indigo-400 transition-colors">Blog</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold text-white mb-4">Connect</h3>
                        <div className="flex gap-4">
                            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:scale-110 transition-all">
                                <FaGithub size={24} />
                            </a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 hover:scale-110 transition-all">
                                <FaTwitter size={24} />
                            </a>
                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 hover:scale-110 transition-all">
                                <FaLinkedin size={24} />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-8 text-center text-gray-500 text-sm">
                    <p>© {new Date().getFullYear()} My Portfolio. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}

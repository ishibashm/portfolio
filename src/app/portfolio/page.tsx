import Link from 'next/link';
import Image from 'next/image';
import { portfolios } from '@/lib/portfolios';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio | My Portfolio',
  description: 'Selected works and experiments.',
};

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Portfolio
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            A collection of my recent projects, experiments, and digital creations.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((project) => (
            <Link key={project.id} href={`/portfolio/${project.slug}`} className="block group">
              <article className="h-full bg-gray-900 border border-white/10 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1">
                <div className="aspect-video bg-gray-800 relative overflow-hidden">
                  <div className="absolute inset-0 group-hover:scale-105 transition-transform duration-500">
                    <Image
                      src={project.image}
                      alt={project.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      unoptimized
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-60 z-10 pointer-events-none"></div>

                  {/* Tags Overlay */}
                  <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2">
                    {project.tags && project.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-1 text-xs font-semibold bg-black/50 backdrop-blur-sm border border-white/20 rounded-md text-white">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  <h2 className="text-2xl font-bold mb-3 group-hover:text-indigo-400 transition-colors">
                    {project.title}
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">
                    {project.description}
                  </p>
                  <div className="mt-4 flex items-center text-indigo-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                    View Project <span className="ml-2">→</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

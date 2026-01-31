export const portfolios = [
  {
    id: "1",
    title: "Project Alpha",
    description: "A cutting-edge web application built with Next.js.",
    slug: "project-alpha",
    image: "/images/project-alpha.png",
    content: `
          <h2>Project Overview</h2>
      <p>Project Alpha is a comprehensive web application designed to demonstrate the power of Next.js and React server components. It features a seamless user experience, high performance, and a modern design.</p>
      
      <h3>Key Features</h3>
      <ul>
        <li>Server-side rendering for optimal SEO</li>
        <li>Interactive UI components</li>
        <li>Responsive design for all devices</li>
      </ul>
      
      <h3>Design Concept</h3>
      <p>The design focuses on minimalism and usability. We used a dark mode theme with vibrant accent colors to create a modern and tech-savvy look.</p>
    `,
    date: "2025-10-15",
    tags: ["Next.js", "React", "Tailwind CSS"],
  },
  {
    id: "2",
    title: "Project Beta",
    description: "An e-commerce platform with seamless user experience.",
    slug: "project-beta",
    image: "/images/project-beta.png",
    content: `
          <h2>Project Overview</h2>
      <p>Project Beta is an e-commerce platform...</p>
    `,
    date: "2025-11-20",
    tags: ["E-commerce", "Stripe", "Supabase"],
  },
  {
    id: "3",
    title: "Yakumoin Scraper",
    description:
      "A Python-based web scraper for archiving data from Yakumoin.info.",
    slug: "yakumoin-scraper",
    image: "/images/yakumoin-scraper.png",
    content: `
      <h2>Project Overview</h2>
      <p>This project is a Python script designed to archive data from the Yakumoin website. It extracts content, saves it to JSON, and takes snapshots of the pages.</p>
      
      <h3>Key Features</h3>
      <ul>
        <li>Automated data extraction</li>
        <li>JSON data storage</li>
        <li>HTML snapshot preservation</li>
      </ul>

      <h3>Download</h3>
      <p>You can download the scraper package below:</p>
      <p>
        <a href="/yakumoin_scraper.zip" class="inline-block px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors">
          Download Tool (.zip)
        </a>
      </p>
    `,
    date: "2026-01-31",
    tags: ["Python", "Web Scraping", "Automation"],
  },
];

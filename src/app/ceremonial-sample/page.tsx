import React from 'react';
import { WeddingDateSelector } from '../../components/WeddingDateSelector';
import { TenchusatsuVisualizer } from '../../components/TenchusatsuVisualizer';

/**
 * Ceremonial Logic Demo Page
 * 
 * Shows the "Wedding Date Selection" logic in action.
 * This page serves as a "Plan B" artifact:
 * "I practiced implementing the complex logic required for your system using AI."
 */
export default function CeremonialSamplePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto align-middle">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl md:text-6xl mb-4">
            <span className="block xl:inline">Ceremonial System</span>{' '}
            <span className="block text-indigo-600 xl:inline">Logic Demo</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Demonstrating valid business logic for Wedding Systems: <br/>
            <strong>Rokuyo (Six Labels) Calculation & Auspicious Date Selection</strong>
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
             <div className="rounded-md shadow">
              <a href="/" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10">
                Back to Portfolio
              </a>
            </div>
          </div>
        </div>

        {/* The Logic Component */}
        <WeddingDateSelector />
        <TenchusatsuVisualizer birthDateStr="1990-01-01" />

        {/* Technical Explanation Section */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg mt-12 max-w-4xl mx-auto">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Technical Implementation Details
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              How this logic mimics the Target System requirements.
            </p>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">
                  Target Year
                </dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  2026-2027 (Relevant for current bookings)
                </dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">
                  Logic Complexity
                </dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  Approximates Lunar Calendar conversion (`src/utils/lunar.ts`) and calculates "Rokuyo" index dynamically.
                  Filters for "Taian" and "Tomobiki" as primary auspicious dates.
                </dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">
                  Why this matters?
                </dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  Demonstrates the ability to handle <strong>"Business Rules that cannot be easily defined in Low-code tools"</strong>.
                  While WebPerformer handles CRUD, this custom logic handles the core value of the ceremonial business.
                </dd>
              </div>
            </dl>
          </div>
        </div>

      </div>
    </div>
  );
}

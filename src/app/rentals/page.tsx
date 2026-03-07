"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { Home, ExternalLink, Calendar, MapPin, JapaneseYen, Clock, ArrowUpDown, ArrowUp, ArrowDown, Plus } from "lucide-react";
import type { Database } from "@/types/database.types";
import { addSampleData, triggerRealScrape } from "./actions";

type RentalProperty = Database["public"]["Tables"]["rental_properties"]["Row"];
type SortField = 'rent' | 'size_sqm' | 'first_seen_at';
type SortOrder = 'asc' | 'desc';

export const dynamic = 'force-dynamic';

export default function RentalsDashboard() {
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('first_seen_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterNewBuild, setFilterNewBuild] = useState(false);
  const [search, setSearch] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchProperties();
  }, []);

  async function fetchProperties() {
    setLoading(true);
    const { data, error } = await supabase
      .from("rental_properties")
      .select("*")
      .order("first_seen_at", { ascending: false });

    if (error) {
      console.error("Error fetching properties:", error);
    } else {
      setProperties(data || []);
    }
    setLoading(false);
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default to descending when changing fields
    }
  };

  const handleGenerateSample = async () => {
    setIsGenerating(true);
    const result = await addSampleData();
    if (result.success) {
      await fetchProperties();
    } else {
      alert("Error: " + result.error);
    }
    setIsGenerating(false);
  };

  const [isFetchingReal, setIsFetchingReal] = useState(false);
  const handleFetchReal = async () => {
    setIsFetchingReal(true);
    const result = await triggerRealScrape();
    if (result.success) {
      alert("✅ 取得リクエストを送信しました！数秒後にデータを更新してください。");
      await fetchProperties();
    } else {
      alert("エラーが発生しました: " + result.error + "\n\n(GAS Web AppのURLが設定されていない可能性があります。マニュアルを参照してください)");
    }
    setIsFetchingReal(false);
  };

  const filteredAndSortedProperties = useMemo(() => {
    let result = [...properties];

    // Filter
    if (filterNewBuild) {
      result = result.filter(p => p.is_new_build);
    }
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(p => 
        p.property_name.toLowerCase().includes(lowerSearch) || 
        (p.area && p.area.toLowerCase().includes(lowerSearch))
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle nulls
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (sortField === 'first_seen_at') {
        aVal = new Date(aVal as string).getTime();
        bVal = new Date(bVal as string).getTime();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [properties, sortField, sortOrder, filterNewBuild, search]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-zinc-600 ml-1" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-blue-400 ml-1" /> : <ArrowDown className="w-4 h-4 text-blue-400 ml-1" />;
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
              <Home className="w-8 h-8 text-blue-400" />
              Real Estate Dashboard
            </h1>
            <p className="text-zinc-400 mt-2">Automated rental property tracking</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleFetchReal}
              disabled={isFetchingReal || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {isFetchingReal ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {isFetchingReal ? "取得中..." : "今すぐ取得する"}
            </button>
            <button 
              onClick={handleGenerateSample}
              disabled={isGenerating || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {isGenerating ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {isGenerating ? "Generating..." : "サンプルを作る"}
            </button>
            <button 
              onClick={fetchProperties}
              disabled={loading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Refresh Data
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
             <input 
              type="text" 
              placeholder="Search by name or area..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={filterNewBuild}
              onChange={(e) => setFilterNewBuild(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">New Builds Only</span>
          </label>
        </div>

        {/* Table/List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/50 text-zinc-400 uppercase font-semibold text-xs border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4">Property</th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors" onClick={() => handleSort('rent')}>
                    <div className="flex items-center">Rent & Fee <SortIcon field="rent" /></div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors" onClick={() => handleSort('size_sqm')}>
                    <div className="flex items-center">Specs <SortIcon field="size_sqm" /></div>
                  </th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors" onClick={() => handleSort('first_seen_at')}>
                    <div className="flex items-center">Market Time <SortIcon field="first_seen_at" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                      Loading properties...
                    </td>
                  </tr>
                ) : filteredAndSortedProperties.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      No properties found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedProperties.map((prop) => {
                    const daysOnMarket = prop.first_seen_at 
                      ? Math.max(0, differenceInDays(new Date(), new Date(prop.first_seen_at)))
                      : 0;
                    
                    // DOM styling logic
                    let domStyle = "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
                    if (daysOnMarket > 14) domStyle = "text-amber-400 bg-amber-400/10 border-amber-400/20";
                    if (daysOnMarket > 30) domStyle = "text-rose-400 bg-rose-400/10 border-rose-400/20";

                    return (
                      <tr key={prop.id} className="hover:bg-zinc-800/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            {prop.url ? (
                              <a href={prop.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-400 hover:text-blue-300 text-base flex items-center gap-1">
                                {prop.property_name} <ExternalLink className="w-4 h-4 inline" />
                              </a>
                            ) : (
                              <span className="font-semibold text-zinc-200 text-base">{prop.property_name}</span>
                            )}
                            <div className="flex items-center gap-3 text-zinc-500 text-xs mt-1">
                              {prop.area && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {prop.area}
                                </span>
                              )}
                              {prop.minutes_to_station !== null && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {prop.minutes_to_station} min
                                </span>
                              )}
                            </div>
                            {prop.is_new_build && (
                              <span className="inline-block mt-2 px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-xs font-semibold w-max">
                                新築
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-lg text-zinc-100 flex items-center gap-1">
                               {prop.rent ? `¥${prop.rent.toLocaleString()}` : '-'}
                            </span>
                            <span className="text-zinc-500 text-xs">
                              +{prop.management_fee ? `¥${prop.management_fee.toLocaleString()} fee` : 'No fee'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-zinc-300 font-medium bg-zinc-800 px-2 py-1 rounded w-max">
                              {prop.layout || 'N/A'}
                            </span>
                            <span className="text-zinc-400 text-xs mt-1">
                              {prop.size_sqm ? `${prop.size_sqm} m²` : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-2">
                            {prop.first_seen_at ? (
                                <>
                                  <span className={`px-2.5 py-1 border rounded-full text-xs font-semibold ${domStyle}`}>
                                    {daysOnMarket === 0 ? 'New Today' : `${daysOnMarket} DOM`}
                                  </span>
                                  <span className="text-zinc-500 text-xs flex items-center gap-1" title={new Date(prop.last_seen_at || prop.first_seen_at).toLocaleString()}>
                                    <Calendar className="w-3 h-3" />
                                    Last seen: {formatDistanceToNow(new Date(prop.last_seen_at || prop.first_seen_at), { addSuffix: true })}
                                  </span>
                                </>
                            ) : '-'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="min-h-screen bg-zinc-950 text-zinc-300 p-8 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl text-zinc-100 font-light mb-4">Rentals Dashboard</h1>
        <p className="text-zinc-400">This feature is currently under construction and is hidden from public view.</p>
      </div>
    </div>
  );
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
  */
}

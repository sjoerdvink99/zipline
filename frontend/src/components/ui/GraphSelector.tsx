import { useEffect, useState, useRef } from "react";
import api, { isAbortedRequest } from "../../api";

export const GraphSelector = () => {
  const [graphs, setGraphs] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    async function fetchGraphs() {
      try {
        const res = await api.get("/api/graph/list", {
          signal: abortRef.current?.signal,
        });
        setGraphs(res.data.graphs);
        setActive(res.data.active);
      } catch (err) {
        if (!isAbortedRequest(err)) {
          console.error("Failed to fetch graphs:", err);
        }
      }
    }
    fetchGraphs();

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSwitch = async (name: string) => {
    setLoading(true);
    const res = await api.post("/api/graph/switch", { name });
    const activeName = res.data?.active ?? name;
    setActive(activeName);
    window.dispatchEvent(
      new CustomEvent("gb:graph-switched", { detail: { active: activeName } })
    );
    window.dispatchEvent(new Event("gb:candidates-updated"));
    setLoading(false);
  };

  if (graphs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-gray-500">Dataset</span>
      <select
        className="text-xs border border-gray-200 bg-white rounded-md px-2.5 py-1.5 text-gray-700 font-medium focus:ring-2 focus:ring-gray-300 focus:border-gray-400 disabled:opacity-50 cursor-pointer"
        value={active}
        disabled={loading}
        onChange={(e) => handleSwitch(e.target.value)}
      >
        {graphs.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
};

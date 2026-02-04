import React, { useState } from "react";
import {
  testNeo4jConnection,
  type ConnectionTestResult,
  type Neo4jConnectionConfig,
} from "../../api/data_sources";
import {
  CheckCircleIcon,
  LoadingSpinner,
  XCircleIcon,
} from "../ui/Icons";

interface Props {
  onConnected: (config: Neo4jConnectionConfig, result: ConnectionTestResult) => void;
}

export function Neo4jConnectionForm({ onConnected }: Props) {
  const [uri, setUri] = useState("bolt://localhost:7687");
  const [username, setUsername] = useState("neo4j");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const handleTest = async () => {
    if (!uri.trim() || !username.trim()) return;
    const config: Neo4jConnectionConfig = { uri: uri.trim(), username: username.trim(), password };
    setTesting(true);
    setResult(null);
    try {
      const res = await testNeo4jConnection(config);
      setResult(res);
      if (res.success) {
        onConnected(config, res);
      }
    } catch {
      setResult({ success: false, message: "Request failed — check backend connectivity", neo4j_version: null });
    } finally {
      setTesting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTest();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-2xs font-medium text-gray-600 uppercase tracking-wide">
            Connection URI
          </label>
          <input
            type="text"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="bolt://localhost:7687"
            className="w-full h-9 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
          />
        </div>

        <div className="space-y-1">
          <label className="text-2xs font-medium text-gray-600 uppercase tracking-wide">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="neo4j"
            className="w-full h-9 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
          />
        </div>

        <div className="space-y-1">
          <label className="text-2xs font-medium text-gray-600 uppercase tracking-wide">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            className="w-full h-9 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing || !uri.trim() || !username.trim()}
          className="h-9 px-4 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {testing ? (
            <>
              <LoadingSpinner className="w-3 h-3 border-gray-600 border-t-white" />
              Connecting…
            </>
          ) : (
            "Test Connection"
          )}
        </button>

        {result && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              result.success ? "text-green-700" : "text-red-600"
            }`}
          >
            {result.success ? (
              <CheckCircleIcon className="w-4 h-4 shrink-0" />
            ) : (
              <XCircleIcon className="w-4 h-4 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

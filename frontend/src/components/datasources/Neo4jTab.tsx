import { useState } from "react";
import {
  getNeo4jSchema,
  type ConnectionTestResult,
  type Neo4jConnectionConfig,
  type Neo4jSchemaInfo,
} from "../../api/data_sources";
import { DatabaseIcon, LoadingSpinner, XMarkIcon } from "../ui/Icons";
import { Neo4jConnectionForm } from "./Neo4jConnectionForm";
import { Neo4jQueryEditor } from "./Neo4jQueryEditor";

interface Props {
  onDatasetLoaded: (id: string) => void;
}

export function Neo4jTab({ onDatasetLoaded }: Props) {
  const [connection, setConnection] = useState<Neo4jConnectionConfig | null>(null);
  const [schema, setSchema] = useState<Neo4jSchemaInfo | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const handleConnected = async (
    config: Neo4jConnectionConfig,
    _result: ConnectionTestResult,
  ) => {
    setConnection(config);
    setSchemaLoading(true);
    setSchemaError(null);
    setSchema(null);
    try {
      const s = await getNeo4jSchema(config);
      setSchema(s);
    } catch {
      setSchemaError("Failed to fetch database schema");
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleDisconnect = () => {
    setConnection(null);
    setSchema(null);
    setSchemaError(null);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100">
            <DatabaseIcon className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Neo4j Connection</h3>
            <p className="text-2xs text-gray-500">Connect to a local or remote Neo4j instance</p>
          </div>
          {connection && (
            <button
              onClick={handleDisconnect}
              className="ml-auto flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-3 h-3" />
              Disconnect
            </button>
          )}
        </div>

        {!connection ? (
          <Neo4jConnectionForm onConnected={handleConnected} />
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            Connected to{" "}
            <span className="font-medium truncate max-w-[240px]">{connection.uri}</span>
          </div>
        )}
      </div>

      {schemaLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <LoadingSpinner className="w-3.5 h-3.5" />
          Loading database schema…
        </div>
      )}

      {schemaError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {schemaError}
        </div>
      )}

      {schema && connection && (
        <>
          <div className="border-t border-gray-100" />
          <Neo4jQueryEditor
            connection={connection}
            schema={schema}
            onDatasetLoaded={onDatasetLoaded}
          />
        </>
      )}
    </div>
  );
}

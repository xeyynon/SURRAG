import { useEffect, useState } from 'react'
import { t } from './i18n'

export default function CatalogBar({ lang, refreshKey }) {
  const [stats, setStats] = useState(null)
  const [schema, setSchema] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
  }, [refreshKey])

  function toggleSchema() {
    if (!open && !schema) {
      fetch('/api/catalog/schema')
        .then((r) => r.json())
        .then(setSchema)
        .catch(() => {})
    }
    setOpen((o) => !o)
  }

  if (!stats) return null

  return (
    <div className="border-b border-white/5">
      <button
        onClick={toggleSchema}
        className="w-full flex items-center gap-4 text-xs text-gray-500 px-8 py-1.5 hover:text-gray-300 transition-colors"
      >
        <span className="text-orange-400">{t('catalogLabel', lang)}</span>
        <span>{stats.postgres.persons} {t('catPersons', lang)}</span>
        <span>·</span>
        <span>{stats.postgres.cases} {t('catCases', lang)}</span>
        <span>·</span>
        <span>{stats.neo4j.nodes} {t('catNodes', lang)} / {stats.neo4j.edges} {t('catEdges', lang)}</span>
        <span>·</span>
        <span>{stats.qdrant.vectors} {t('catVectors', lang)}</span>
        <span className="ml-auto">{open ? '▲' : '▼'} {t('catalogSchemaToggle', lang)}</span>
      </button>

      {open && schema && (
        <div className="grid grid-cols-3 gap-4 px-8 pb-4 text-xs">
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-1.5">PostgreSQL</div>
            {schema.postgres.map((tbl) => (
              <div key={tbl.table} className="mb-2 bg-[#12141a] border border-white/10 rounded p-2">
                <div className="text-gray-200 font-medium mb-1">{tbl.table}</div>
                {tbl.columns.map((c) => (
                  <div key={c.column} className="text-gray-500">
                    {c.column} <span className="text-gray-600">{c.type}{c.nullable ? '?' : ''}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-1.5">Neo4j</div>
            <div className="bg-[#12141a] border border-white/10 rounded p-2 mb-2">
              <div className="text-gray-200 font-medium mb-1">Node labels</div>
              {Object.entries(schema.neo4j.node_labels).map(([label, props]) => (
                <div key={label} className="text-gray-500">
                  {label} <span className="text-gray-600">({props.join(', ')})</span>
                </div>
              ))}
            </div>
            <div className="bg-[#12141a] border border-white/10 rounded p-2">
              <div className="text-gray-200 font-medium mb-1">Relationship types</div>
              <div className="text-gray-500">{schema.neo4j.relationship_types.join(', ')}</div>
            </div>
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-1.5">Qdrant</div>
            <div className="bg-[#12141a] border border-white/10 rounded p-2 space-y-0.5">
              <div className="text-gray-200 font-medium">{schema.qdrant.collection}</div>
              <div className="text-gray-500">vector_size: {schema.qdrant.vector_size}</div>
              <div className="text-gray-500">distance: {schema.qdrant.distance}</div>
              <div className="text-gray-500">model: {schema.qdrant.embedding_model}</div>
              <div className="text-gray-500">payload: {schema.qdrant.payload_fields.join(', ')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

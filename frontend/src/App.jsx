import React from "react";
import { C, FONTS } from "./theme.js";
import { Centered } from "./components/ui.jsx";
import QuerySidebar from "./components/QuerySidebar.jsx";
import { ComparisonHeader, ComparisonFooter } from "./components/ComparisonChrome.jsx";
import { AlignedComparison, SimilarityEvidence, SimilarityFocus } from "./components/similarity.jsx";
import PatientPanel from "./components/PatientPanel.jsx";
import { useComparison } from "./hooks/useComparison.js";

export default function App() {
  const {
    session,
    queries,
    queryPatientId,
    selectedId,
    setSelectedId,
    candidate,
    tab,
    setTab,
    note,
    setNote,
    candidateSearch,
    setCandidateSearch,
    error,
    saving,
    loadingSession,
    setShowSimilarOnly,
    loadSession,
    decide,
    selectedSummary,
    filtered,
    status,
    similarityFilterActive,
    reviewed,
  } = useComparison();

  if (error && !session) return <Centered>Lỗi: {error}</Centered>;
  if (!session) return <Centered>Đang tải Top-20 và dữ liệu raw…</Centered>;

  return (
    <main style={{ minHeight: "100vh", display: "flex", background: C.bg, color: C.ink, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONTS}</style>
      <QuerySidebar
        queries={queries}
        queryPatientId={queryPatientId}
        loadSession={loadSession}
        loadingSession={loadingSession}
        reviewed={reviewed}
        candidateCount={session.candidates.length}
        candidateSearch={candidateSearch}
        setCandidateSearch={setCandidateSearch}
        filtered={filtered}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
      />
      <section style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
        <ComparisonHeader
          session={session}
          selectedSummary={selectedSummary}
          selectedId={selectedId}
          status={status}
          tab={tab}
          setTab={setTab}
          setShowSimilarOnly={setShowSimilarOnly}
          candidate={candidate}
          similarityFilterActive={similarityFilterActive}
        />
        <SimilarityEvidence evidence={candidate?.similarity_evidence} />
        {similarityFilterActive && <SimilarityFocus tab={tab} evidence={candidate?.similarity_evidence} />}
        {similarityFilterActive && candidate
          ? <AlignedComparison tab={tab} evidence={candidate.similarity_evidence} queryId={session.query.id} candidateId={candidate.patient.id} />
          : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 1, flex: 1, overflow: "hidden", background: C.border }}>
              <PatientPanel title="Bệnh nhân query" patient={session.query} tab={tab} evidence={candidate?.similarity_evidence} similarOnly={similarityFilterActive} side="query" />
              {candidate
                ? <PatientPanel title={`Bệnh nhân tương tự #${candidate.rank} · ${(candidate.similarity_score * 100).toFixed(2)}%`} patient={candidate.patient} tab={tab} evidence={candidate.similarity_evidence} similarOnly={similarityFilterActive} side="candidate" />
                : <Centered>Đang tải hồ sơ tương tự…</Centered>}
            </div>
          )}
        <ComparisonFooter
          note={note}
          setNote={setNote}
          decide={decide}
          saving={saving}
          candidate={candidate}
          status={status}
          queryId={session.query.id}
          error={error}
        />
      </section>
    </main>
  );
}

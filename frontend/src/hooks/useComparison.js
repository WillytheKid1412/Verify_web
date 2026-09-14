import { useEffect, useMemo, useState } from "react";
import {
  fetchComparison,
  fetchComparisonCandidate,
  fetchComparisonQueries,
  submitComparisonVerification,
} from "../api.js";

export function useComparison() {
  const [session, setSession] = useState(null);
  const [queries, setQueries] = useState([]);
  const [queryPatientId, setQueryPatientId] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [tab, setTab] = useState("ehr");
  const [note, setNote] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSimilarOnly, setShowSimilarOnly] = useState(false);

  async function loadSession(patientId) {
    const cleanId = String(patientId || "").trim();
    if (!cleanId) return;
    setLoadingSession(true);
    setError("");
    setCandidate(null);
    try {
      const data = await fetchComparison(cleanId);
      setSession(data);
      setQueryPatientId(data.query.id);
      setCandidateSearch("");
      setSelectedId(data.candidates[0]?.patient_id || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingSession(false);
    }
  }

  useEffect(() => {
    fetchComparisonQueries().then((data) => {
      setQueries(data.queries || []);
      if (!data.default_query_patient_id) {
        setError("Chưa có verification batch đang hoạt động. Hãy import và kích hoạt dữ liệu trước khi review.");
        setLoadingSession(false);
        return undefined;
      }
      return loadSession(data.default_query_patient_id);
    }).catch((requestError) => {
      setError(requestError.message);
      setLoadingSession(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId || !queryPatientId) return undefined;
    const controller = new AbortController();
    setCandidate(null);
    fetchComparisonCandidate(queryPatientId, selectedId).then((data) => {
      if (!controller.signal.aborted) setCandidate(data);
    }).catch((requestError) => !controller.signal.aborted && setError(requestError.message));
    return () => controller.abort();
  }, [selectedId, queryPatientId]);

  useEffect(() => setNote(candidate?.verification?.note || ""), [candidate]);

  const selectedSummary = useMemo(
    () => session?.candidates.find((item) => item.patient_id === selectedId),
    [session, selectedId],
  );
  const filtered = useMemo(
    () => (session?.candidates || []).filter((item) => item.patient_id.includes(candidateSearch.trim())),
    [session, candidateSearch],
  );

  const status = candidate?.verification?.status || selectedSummary?.verification?.status || "pending";
  const similarityFilterActive = showSimilarOnly && (tab === "ehr" || tab === "labs");
  const reviewed = (session?.candidates || []).filter(
    (item) => item.verification?.status && item.verification.status !== "pending",
  ).length;

  async function decide(nextStatus) {
    if (!candidate) return;
    setSaving(true);
    try {
      const saved = await submitComparisonVerification(
        session.query.id,
        candidate.patient_id,
        { status: nextStatus, note, version: candidate.verification?.version || 0 },
      );
      const verification = {
        status: saved.status,
        note: saved.note,
        reviewer: saved.reviewer,
        at: saved.at,
        version: saved.version,
      };
      setCandidate((old) => ({ ...old, verification }));
      setSession((old) => ({
        ...old,
        candidates: old.candidates.map((item) => (
          item.patient_id === candidate.patient_id ? { ...item, verification } : item
        )),
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return {
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
  };
}

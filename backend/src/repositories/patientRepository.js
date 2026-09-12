import { query } from "../db/pool.js";

function isoDate(value) {
  if (!value) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function getPatient(patientId) {
  const patientResult = await query(
    "SELECT id, age_text, gender_text FROM patients WHERE id = $1",
    [patientId],
  );
  const patient = patientResult.rows[0];
  if (!patient) return null;

  const [encountersResult, ehrResult, labsResult, imagingResult] = await Promise.all([
    query(
      `SELECT id, label, encounter_date
         FROM encounters WHERE patient_id = $1
        ORDER BY encounter_date NULLS LAST, created_at, id`,
      [patientId],
    ),
    query(
      `SELECT DISTINCT ON (e.id) e.id AS encounter_id, d.content
         FROM encounters e
         JOIN ehr_documents d ON d.encounter_id = e.id
        WHERE e.patient_id = $1
        ORDER BY e.id, d.version DESC`,
      [patientId],
    ),
    query(
      `SELECT l.encounter_id, l.test_name, l.value_text, l.unit, l.reference_range,
              l.abnormal, l.sample, l.department, l.diagnosis, l.result_at
         FROM encounters e
         JOIN lab_results l ON l.encounter_id = e.id
        WHERE e.patient_id = $1
        ORDER BY l.result_at DESC NULLS LAST, l.id`,
      [patientId],
    ),
    query(
      `SELECT st.encounter_id, st.id AS study_id, st.modality, st.label AS study_label,
              st.study_at, se.id AS series_id, se.label AS series_label,
              se.slice_count, se.shape
         FROM encounters e
         JOIN imaging_studies st ON st.encounter_id = e.id
         JOIN imaging_series se ON se.study_id = st.id
        WHERE e.patient_id = $1
        ORDER BY st.study_at NULLS LAST, st.id, se.id`,
      [patientId],
    ),
  ]);

  const ehrByEncounter = new Map(ehrResult.rows.map((row) => [row.encounter_id, row.content || {}]));
  const labsByEncounter = new Map();
  for (const row of labsResult.rows) {
    const values = labsByEncounter.get(row.encounter_id) || [];
    values.push({
      name: row.test_name,
      value: row.value_text ?? "—",
      unit: row.unit || "",
      range: row.reference_range || "—",
      flagged: row.abnormal,
      date: isoDate(row.result_at),
      sample: row.sample || "—",
      department: row.department || "—",
      diagnosis: row.diagnosis || "",
    });
    labsByEncounter.set(row.encounter_id, values);
  }

  const studiesByEncounter = new Map();
  for (const row of imagingResult.rows) {
    if (!studiesByEncounter.has(row.encounter_id)) {
      studiesByEncounter.set(row.encounter_id, { XQ: [], CT: [], MRI: [] });
    }
    const modalityStudies = studiesByEncounter.get(row.encounter_id)[row.modality];
    let study = modalityStudies.find((item) => item.id === row.study_id);
    if (!study) {
      study = { id: row.study_id, label: row.study_label, date: isoDate(row.study_at), series: [] };
      modalityStudies.push(study);
    }
    study.series.push({
      id: row.series_id,
      label: row.series_label,
      sliceCount: row.slice_count,
      shape: row.shape,
      sliceUrl: `/api/imaging/series/${row.series_id}/slices`,
    });
  }

  return {
    id: patient.id,
    age: patient.age_text || "—",
    gender: patient.gender_text || "—",
    records: encountersResult.rows.map((encounter) => {
      const content = ehrByEncounter.get(encounter.id) || {};
      return {
        id: encounter.id,
        label: encounter.label,
        date: isoDate(encounter.encounter_date),
        ehr: { details: Array.isArray(content.details) ? content.details : [] },
        labs: labsByEncounter.get(encounter.id) || [],
        studies: studiesByEncounter.get(encounter.id) || { XQ: [], CT: [], MRI: [] },
      };
    }),
  };
}

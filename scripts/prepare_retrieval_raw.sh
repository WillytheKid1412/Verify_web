#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORKING_DIR="$(cd -- "$PROJECT_DIR/.." && pwd)"
REPOSITORY_DIR="$(cd -- "$WORKING_DIR/.." && pwd)"

INGEST_SCRIPT="$WORKING_DIR/our_method/code/data_ingestion/creating_data.py"
ZIP_INDEX_CSV="${ZIP_INDEX_CSV:-$WORKING_DIR/our_method/statistic/data/zip_index_with_dicom.csv}"
EHR_XLSX="${EHR_XLSX:-$REPOSITORY_DIR/data/175/thông tin bệnh án 175.xlsx}"
RETRIEVAL_CONFIG="${RETRIEVAL_CONFIG:-$PROJECT_DIR/backend/src/data/retrieval.json}"
TOPK_FILE="${TOPK_FILE:-/mnt/disk4/similar_cases_retrieval/data/experiments/patient_fusion/top20_attention_pool_all_patients_v1/top20_related_patients.csv}"
RAW_ARCHIVE_ROOT="${RAW_ARCHIVE_ROOT:-/mnt/disk4/similar_cases_retrieval/data/raw}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$PROJECT_DIR/app/data/raw}"
TOP_K="${TOP_K:-20}"

for required_path in "$INGEST_SCRIPT" "$ZIP_INDEX_CSV" "$EHR_XLSX" "$RETRIEVAL_CONFIG" "$TOPK_FILE" "$RAW_ARCHIVE_ROOT"; do
  if [[ ! -e "$required_path" ]]; then
    echo "Không tìm thấy nguồn bắt buộc: $required_path" >&2
    exit 1
  fi
done

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_CANDIDATES=("$PYTHON_BIN")
else
  PYTHON_CANDIDATES=(
    "/home/vaipe/.conda/envs/smplerx/bin/python"
    "python3"
  )
fi

SELECTED_PYTHON=""
for candidate in "${PYTHON_CANDIDATES[@]}"; do
  if command -v "$candidate" >/dev/null 2>&1 \
    && "$candidate" -c "import numpy, pandas, pydicom, openpyxl" >/dev/null 2>&1; then
    SELECTED_PYTHON="$candidate"
    break
  fi
done

if [[ -z "$SELECTED_PYTHON" ]]; then
  echo "Không tìm thấy Python có numpy, pandas, pydicom và openpyxl." >&2
  echo "Hãy đặt PYTHON_BIN=/đường/dẫn/tới/python phù hợp." >&2
  exit 1
fi

echo "Python             : $SELECTED_PYTHON"
echo "Kho ZIP DICOM      : $RAW_ARCHIVE_ROOT"
echo "DICOM index        : $ZIP_INDEX_CSV"
echo "EHR/Lab Excel      : $EHR_XLSX"
echo "Retrieval config   : $RETRIEVAL_CONFIG"
echo "Top-K CSV          : $TOPK_FILE"
echo "Giới hạn rank      : 1-$TOP_K"
echo "Output raw         : $OUTPUT_ROOT"

export PYTHONUNBUFFERED=1
exec "$SELECTED_PYTHON" "$INGEST_SCRIPT" \
  --zip-index-csv "$ZIP_INDEX_CSV" \
  --ehr-xlsx "$EHR_XLSX" \
  --out-root "$OUTPUT_ROOT" \
  --retrieval-config "$RETRIEVAL_CONFIG" \
  --topk-file "$TOPK_FILE" \
  --top-k "$TOP_K" \
  "$@"

/**
 * src/services/api.ts
 *
 * QualiEdge Centralized Edge REST API Client.
 * Connects the React HMI Dashboard, History Explorer, Operator Stations,
 * and Deployment Tuning directly to the on-device Python REST server.
 */

const API_BASE = '/api';

export interface InspectionRecord {
  inspection_id: string;
  product_id: string;
  timestamp: string;
  defect_detected: boolean;
  defect_type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical' | 'None' | 'Indeterminate';
  confidence: number;
  location: string;
  decision: 'ACCEPT' | 'REJECT' | 'MANUAL_REVIEW';
  recommendation: string;
  inference_ms?: number;
  boxes?: any[];
  root_cause?: string;
  implications?: string;
  remediation_steps?: string[] | string;
  shift_log_summary?: string;
  operator_logs?: any[];
  [key: string]: any;
}

export interface InspectionStats {
  total_inspections: number;
  accepted: number;
  rejected: number;
  manual_review: number;
  defect_rate_pct: number;
  average_latency_ms: number;
  defect_distribution?: Record<string, number>;
  severity_distribution?: Record<string, number>;
}

export interface HealthStatus {
  status: string;
  edge_device: string;
  npu_accel: string;
  offline_mode: boolean;
  sqlite_connected: boolean;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    // If backend direct port fallback is needed in case of direct dev testing
    if (endpoint.startsWith('/') && !window.location.origin.includes(':8000')) {
      try {
        const directUrl = `http://localhost:8000/api${endpoint}`;
        const directRes = await fetch(directUrl, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });
        if (directRes.ok) {
          return await directRes.json();
        }
      } catch {
        // Fall back to original error
      }
    }
    throw err;
  }
}

export const api = {
  // System Health
  async getHealth(): Promise<HealthStatus> {
    return request<HealthStatus>('/health');
  },

  // KPI Statistics
  async getStats(): Promise<InspectionStats> {
    return request<InspectionStats>('/stats');
  },

  // Specimen Presets from User Dataset
  async getSpecimens(): Promise<Array<{
    id: string;
    name: string;
    filename: string;
    url: string;
    defect_type: string;
    ground_truth: string;
    expected_severity: string;
    expected_decision: string;
    description: string;
  }>> {
    return request('/specimens');
  },

  // Inspection Run (Dual-Engine YOLO + Llama Advisory)
  async runInspection(productId?: string, imageBase64?: string): Promise<{
    status: string;
    inspection: InspectionRecord;
    boxes: any[];
    advisory: any;
    hardware_telemetry: any;
  }> {
    return request('/inspect', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, image_base64: imageBase64 })
    });
  },

  // Inspection History with Multi-Criteria Filters
  async getHistory(params: {
    limit?: number;
    offset?: number;
    product_id?: string;
    defect_type?: string;
    severity?: string;
    decision?: string;
    confidence_min?: number;
    confidence_max?: number;
    sort_by?: string;
    order?: string;
  } = {}): Promise<{ total: number; limit: number; offset: number; records: InspectionRecord[] }> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.product_id) query.set('product_id', params.product_id);
    if (params.defect_type && params.defect_type !== 'ALL') query.set('defect_type', params.defect_type);
    if (params.severity && params.severity !== 'ALL') query.set('severity', params.severity);
    if (params.decision && params.decision !== 'ALL') query.set('decision', params.decision);
    if (params.confidence_min !== undefined) query.set('confidence_min', String(params.confidence_min));
    if (params.confidence_max !== undefined) query.set('confidence_max', String(params.confidence_max));
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.order) query.set('order', params.order);

    const qs = query.toString();
    return request(`/${qs ? `history?${qs}` : 'history'}`);
  },

  // Single Inspection Record
  async getInspection(inspectionId: string): Promise<InspectionRecord> {
    return request<InspectionRecord>(`/inspection/${encodeURIComponent(inspectionId)}`);
  },

  // Operator Formal Override Log
  async overrideInspection(payload: {
    inspection_id: string;
    operator_id: string;
    action: string;
    notes?: string;
  }): Promise<{ status: string; log_id: number; inspection: InspectionRecord }> {
    return request('/operator/override', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Shift Quality Report
  async getShiftReport(shift = 'Current Shift', startDate?: string, endDate?: string): Promise<any> {
    const query = new URLSearchParams({ shift });
    if (startDate) query.set('start_date', startDate);
    if (endDate) query.set('end_date', endDate);
    return request(`/reports/shift?${query.toString()}`);
  },

  // Printable ISO 9001 Certificate Data
  async getCertificate(inspectionId: string): Promise<any> {
    return request(`/reports/certificate/${encodeURIComponent(inspectionId)}`);
  },

  // Export CSV
  async exportCsv(params: Record<string, string> = {}): Promise<{ csv: string; format: string; filename: string }> {
    const query = new URLSearchParams(params);
    const qs = query.toString();
    return request(`/${qs ? `history/export?${qs}` : 'history/export'}`);
  },

  // Performance Benchmarking & Telemetry
  async getTelemetry(): Promise<any> {
    return request('/benchmark/telemetry');
  },

  async getHardwareMatrix(): Promise<any> {
    return request('/benchmark/hardware-matrix');
  },

  async runBenchmark(payload: {
    num_frames?: number;
    target_device?: string;
    simulate_heavy_load?: boolean;
  } = {}): Promise<any> {
    return request('/benchmark/run', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async runStressTest(payload: {
    num_iterations?: number;
    target_device?: string;
  } = {}): Promise<any> {
    return request('/benchmark/stress-test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Edge Hardware & Thermal Telemetry
  async getThermalTelemetry(): Promise<any> {
    return request('/deployment/thermal');
  },

  async getHailoStatus(): Promise<any> {
    return request('/deployment/hailo');
  },

  async getCoreAffinities(): Promise<any> {
    return request('/deployment/cores');
  },

  async setCpuGovernor(governor: string): Promise<any> {
    return request('/deployment/governor', {
      method: 'POST',
      body: JSON.stringify({ governor })
    });
  },

  async getDeploymentVerification(): Promise<any> {
    return request('/deployment/verification');
  },

  async getSystemdService(): Promise<{ systemd_unit: string; filename: string }> {
    return request('/deployment/systemd');
  },

  async getBootConfig(): Promise<{ boot_config: string; filename: string }> {
    return request('/deployment/boot-config');
  },

  // Technical Report Endpoints
  async getIeeePaper(): Promise<any> {
    return request('/reports/ieee-paper');
  },

  async getDefenseChecklist(): Promise<any> {
    return request('/reports/defense-checklist');
  },

  async getVideoDemoScript(): Promise<any> {
    return request('/reports/demo-script');
  },

  // Database Maintenance Endpoints
  async getDbMaintenance(): Promise<any> {
    return request('/db/maintenance');
  },

  async vacuumDb(): Promise<any> {
    return request('/db/vacuum', { method: 'POST' });
  },

  async purgeDb(daysOlderThan = 30): Promise<any> {
    return request('/db/purge', {
      method: 'POST',
      body: JSON.stringify({ days_older_than: daysOlderThan })
    });
  }
};

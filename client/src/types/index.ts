
import type { EsimPlan } from "@shared/schema";

export interface PlanDetail {
  plan?: EsimPlan;
  cost: string;
  gb: string;
}

export interface PlansMap {
  [key: string]: PlanDetail;
}


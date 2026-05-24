import { call } from "./index";
import type { Settings, UpdateSettingRequest } from "@/types";

export const settingsApi = {
  getAll: (): Promise<Settings[]> => call<Settings[]>("get_settings"),

  update: (request: UpdateSettingRequest): Promise<void> =>
    call<void>("update_setting", { request }),
};

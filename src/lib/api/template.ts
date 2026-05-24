import { call } from "./index";
import type { CreateTemplateRequest, Template, UpdateTemplateRequest } from "@/types";

export const templateApi = {
  getAll: (): Promise<Template[]> => call<Template[]>("get_templates"),

  getById: (id: string): Promise<Template> => call<Template>("get_template", { id }),

  create: (template: CreateTemplateRequest): Promise<Template> =>
    call<Template>("create_template", { template }),

  update: (id: string, template: UpdateTemplateRequest): Promise<Template> =>
    call<Template>("update_template", { id, template }),

  delete: (id: string): Promise<void> => call<void>("delete_template", { id }),
};

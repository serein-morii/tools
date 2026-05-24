import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templateApi } from "@/lib/api/template";
import type { CreateTemplateRequest, UpdateTemplateRequest } from "@/types";

export const templateKeys = {
  all: ["templates"] as const,
  list: () => [...templateKeys.all, "list"] as const,
  detail: (id: string) => [...templateKeys.all, "detail", id] as const,
};

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list(),
    queryFn: templateApi.getAll,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => templateApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: CreateTemplateRequest) => templateApi.create(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: UpdateTemplateRequest }) =>
      templateApi.update(id, template),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

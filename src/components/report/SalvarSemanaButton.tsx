import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWeekSnapshot } from "@/lib/semanas.functions";

export function SalvarSemanaButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    setError(null);
    const result = await createWeekSnapshot();
    setPending(false);
    if (result.semanaId) {
      queryClient.invalidateQueries({ queryKey: ["notion", "semanas"] });
      navigate({ to: "/semanas/$semanaId", params: { semanaId: result.semanaId } });
      return;
    }
    setError(result.error ?? "Erro ao salvar a semana.");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={pending} size="sm">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {pending ? "Salvando semana…" : "Salvar semana"}
      </Button>
      {error && <p className="text-destructive max-w-xs text-right text-xs">{error}</p>}
    </div>
  );
}

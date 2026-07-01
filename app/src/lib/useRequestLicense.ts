import { useMutation } from "@tanstack/react-query";

const LICENSE_SERVER = "http://80.87.111.142:4000";

export function useRequestLicense() {
  return useMutation({
    mutationFn: ({ email, termMonths }: { email: string; termMonths: number }) =>
      fetch(`${LICENSE_SERVER}/api/request-license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, termMonths }),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Ошибка отправки запроса");
        }
        return r.json();
      }),
  });
}

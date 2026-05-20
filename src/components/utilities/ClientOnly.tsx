"use client";

import { useEffect, useState } from "react";

/**
 * Komponen wrapper untuk memastikan bahwa komponen anak
 * hanya di-render di sisi klien.
 *
 * Ini sangat berguna untuk mencegah hydration mismatch dengan
 * komponen yang bergantung pada state sisi klien seperti tema (mode gelap/terang)
 * atau dimensi window.
 */
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
}

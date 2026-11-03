import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "3rem 1rem" }}>
      <Suspense fallback={<p>Loading sign in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}

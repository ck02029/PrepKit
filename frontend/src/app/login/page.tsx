import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" expired={params.expired === "1"} />;
}

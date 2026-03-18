export { default } from "next-auth/middleware";

export const config = {
    matcher: [
        "/dashboard/:path*",
        // Không include /api/auth/token-login — route đó tự xử lý auth
    ],
};

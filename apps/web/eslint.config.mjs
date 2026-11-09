import next from "eslint-config-next";

const config = [...next, { ignores: [".next/**", "out/**", "public/**", ".lighthouseci/**"] }];

export default config;

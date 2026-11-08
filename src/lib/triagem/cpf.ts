/** Só os dígitos, no máximo 11. */
export function cpfDigitos(valor: string) {
  return valor.replace(/\D/g, "").slice(0, 11);
}

/** Máscara enquanto digita: "52998224725" → "529.982.247-25". */
export function formatarCpf(valor: string) {
  const d = cpfDigitos(valor);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Confere os dígitos verificadores (o back confere de novo). */
export function cpfValido(valor: string) {
  const d = cpfDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

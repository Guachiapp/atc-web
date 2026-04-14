import Image from "next/image";

type GuachiLogoProps = {
  /** Azul sobre fondos claros; blanco sobre fondos oscuros / hero. */
  variant?: "blue" | "white";
  /** Horizontal (cabeceras) o vertical (espacios reducidos). */
  orientation?: "horizontal" | "vertical";
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

const SRC = {
  blue: {
    horizontal: "/images/guachi_logo_azul_horizontal.png",
    vertical: "/images/guachi_logo_azul_vertical.png",
  },
  white: {
    horizontal: "/images/guachi_logo_blanco_horizontal.png",
    vertical: "/images/guachi_logo_blanco_vertical.png",
  },
} as const;

export function GuachiLogo({
  variant = "blue",
  orientation = "horizontal",
  className = "",
  width = 200,
  height = 50,
  priority = false,
}: GuachiLogoProps) {
  const src = SRC[variant][orientation];

  return (
    <Image
      src={src}
      alt="Guachi"
      width={width}
      height={height}
      className={`h-auto w-auto max-w-[min(100%,280px)] object-contain ${className}`}
      priority={priority}
      sizes={orientation === "horizontal" ? "(max-width: 640px) 180px, 240px" : "120px"}
    />
  );
}

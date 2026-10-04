type BrandMarkProps = {
  size?: number;
  wordmark?: boolean;
  className?: string;
};

export default function BrandMark({ size = 34, wordmark = true, className = "" }: BrandMarkProps) {
  return (
    <span className={`brand-lockup ${className}`}>
      <img
        aria-hidden="true"
        alt=""
        className="brand-symbol"
        decoding="async"
        height={size}
        src="/3zai-logo.svg"
        width={size}
      />
      {wordmark ? <span className="brand-wordmark">3ZAI</span> : null}
    </span>
  );
}

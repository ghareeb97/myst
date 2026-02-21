import type { SVGProps } from "react";

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" />
    </svg>
  );
}

export function IconProducts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M8 1.5L14 4.5V8" />
      <path d="M8 1.5L2 4.5V11.5L8 14.5L14 11.5V8" />
      <path d="M2 4.5L8 7.5L14 4.5" />
      <path d="M8 7.5V14.5" />
    </svg>
  );
}

export function IconInvoices(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M9.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V13.5C2.5 14.05 2.95 14.5 3.5 14.5H12.5C13.05 14.5 13.5 14.05 13.5 13.5V5.5L9.5 1.5Z" />
      <path d="M9.5 1.5V5.5H13.5" />
      <path d="M5 8.5H11" />
      <path d="M5 11H9" />
    </svg>
  );
}

export function IconNewInvoice(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M9 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V13.5C2.5 14.05 2.95 14.5 3.5 14.5H10" />
      <path d="M9 1.5V5H13" />
      <path d="M13 1.5V5" />
      <circle cx="12.5" cy="12.5" r="3" />
      <path d="M12.5 11V14" />
      <path d="M11 12.5H14" />
    </svg>
  );
}

export function IconLowStock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M8 2L14.5 13.5H1.5L8 2Z" />
      <path d="M8 6.5V9.5" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

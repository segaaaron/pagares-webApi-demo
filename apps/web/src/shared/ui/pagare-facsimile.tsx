/**
 * Facsímil de un pagaré, en SVG.
 *
 * Es decoración con oficio: reproduce las menciones que la Ley General de
 * Títulos y Operaciones de Crédito pide en el documento —la palabra "pagaré",
 * la promesa incondicional, el importe en número y letra, el nombre del
 * beneficiario, la fecha y el lugar de pago, y la firma del suscriptor— para
 * que quien lo vea reconozca de qué va esto antes de leer una sola etiqueta.
 *
 * Los datos son inventados y el folio lleva la marca DEMOSTRACIÓN encima: un
 * facsímil que pareciera real sería un problema, no un adorno.
 *
 * Va en SVG y no en imagen: pesa dos kilobytes, escala sin borrarse y toma los
 * colores del tema. `aria-hidden` porque no aporta información; lo que hay que
 * saber está en el texto de al lado.
 */
export function PagareFacsimile({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 250"
      className={className}
      role="presentation"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="pagare-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#04231a" floodOpacity="0.35" />
        </filter>
        <clipPath id="pagare-clip">
          <rect x="16" y="12" width="388" height="226" rx="6" />
        </clipPath>
      </defs>

      <g filter="url(#pagare-shadow)">
        <rect x="16" y="12" width="388" height="226" rx="6" fill="#fbfaf6" />
      </g>

      <g clipPath="url(#pagare-clip)">
        {/* Guilloche de fondo: las diagonales finas que llevan los títulos de
            crédito para que no se puedan fotocopiar limpiamente. */}
        <g stroke="#0b7a5b" strokeWidth="0.4" opacity="0.13">
          {Array.from({ length: 34 }, (_, i) => (
            <line key={i} x1={-60 + i * 18} y1={250} x2={60 + i * 18} y2={0} />
          ))}
        </g>

        <rect x="16" y="12" width="388" height="30" fill="#0b7a5b" opacity="0.92" />
        <text x="30" y="32" fill="#ffffff" fontSize="13" fontWeight="600" letterSpacing="3.5" fontFamily="Georgia, serif">
          PAGARÉ
        </text>
        <text x="392" y="26" fill="#ffffff" fontSize="6.5" letterSpacing="1.4" textAnchor="end" fontFamily="monospace">
          FOLIO
        </text>
        <text x="392" y="36" fill="#ffffff" fontSize="9" textAnchor="end" fontFamily="monospace">
          PAG-2026-000142
        </text>

        {/* Importe: el dato que se busca primero, así que va grande y arriba. */}
        <text x="30" y="62" fill="#6a7a71" fontSize="6.5" letterSpacing="1.4" fontFamily="monospace">
          IMPORTE
        </text>
        <text x="30" y="82" fill="#121b17" fontSize="21" fontWeight="600" fontFamily="Georgia, serif">
          $45,000.00
        </text>
        <text x="128" y="82" fill="#6a7a71" fontSize="9" fontFamily="monospace">
          MXN
        </text>

        <text x="30" y="98" fill="#39473f" fontSize="7.5" fontStyle="italic" fontFamily="Georgia, serif">
          CUARENTA Y CINCO MIL PESOS 00/100 M.N.
        </text>

        <line x1="30" y1="108" x2="390" y2="108" stroke="#d2dad4" strokeWidth="1" />

        <text x="30" y="122" fill="#39473f" fontSize="7.5" fontFamily="Georgia, serif">
          Debo(emos) y pagaré(mos) incondicionalmente a la orden de
        </text>
        <text x="30" y="134" fill="#121b17" fontSize="9" fontWeight="600">
          Créditos Morelia, S.A. de C.V.
        </text>

        <text x="30" y="152" fill="#6a7a71" fontSize="6" letterSpacing="1.2" fontFamily="monospace">
          SUSCRIPTOR
        </text>
        <text x="30" y="163" fill="#121b17" fontSize="8.5">
          María López Guzmán
        </text>

        <text x="176" y="152" fill="#6a7a71" fontSize="6" letterSpacing="1.2" fontFamily="monospace">
          VENCE
        </text>
        <text x="176" y="163" fill="#121b17" fontSize="8.5">
          19 de julio de 2026
        </text>

        <text x="286" y="152" fill="#6a7a71" fontSize="6" letterSpacing="1.2" fontFamily="monospace">
          INTERÉS MORATORIO
        </text>
        <text x="286" y="163" fill="#121b17" fontSize="8.5">
          36% anual
        </text>

        <text x="30" y="178" fill="#6a7a71" fontSize="6" letterSpacing="1.2" fontFamily="monospace">
          LUGAR Y FECHA DE EXPEDICIÓN
        </text>
        <text x="30" y="188" fill="#121b17" fontSize="8.5">
          Morelia, Michoacán · 19 de enero de 2026
        </text>

        {/* Firma: trazo suelto, que es como se ve una firma de verdad. */}
        <path
          d="M258 210c8-12 14-16 18-11 4 5-6 18-11 20-4 2-3-4 6-10 10-6 22-11 30-9 8 2 4 8-2 9 12 1 22-3 30-9"
          stroke="#1a3d8f"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <line x1="248" y1="222" x2="390" y2="222" stroke="#39473f" strokeWidth="0.8" />
        <text x="319" y="232" fill="#6a7a71" fontSize="6.5" textAnchor="middle" letterSpacing="1.2" fontFamily="monospace">
          FIRMA DEL SUSCRIPTOR
        </text>

        {/* Sello: deja claro que es una muestra y no un título exigible. */}
        <g transform="rotate(-13 96 214)" opacity="0.45">
          <rect x="38" y="202" width="116" height="24" rx="3" stroke="#b32218" strokeWidth="1.6" />
          <text x="96" y="218" fill="#b32218" fontSize="10" fontWeight="600" textAnchor="middle" letterSpacing="2.5" fontFamily="monospace">
            DEMOSTRACIÓN
          </text>
        </g>
      </g>

      <rect x="16" y="12" width="388" height="226" rx="6" stroke="#d2dad4" strokeWidth="1" />
    </svg>
  );
}

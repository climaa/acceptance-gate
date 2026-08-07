import type { Metadata } from 'next';
import { Prose, Stack } from '@gate/ui';

export const metadata: Metadata = {
  title: 'Sobre mí',
  description: 'Carles Lima — desarrollador web en Barcelona.',
};

export default function AboutPage() {
  return (
    <Stack gap={8}>
      <h1 className="article-header__title">Sobre mí</h1>
      <Prose>
        <p>
          Soy Carles Lima, desarrollador web en Barcelona. Trabajo sobre todo con Next.js
          y TypeScript, y me dedico a la parte que a mucha gente le aburre: que lo que se
          construye se pueda verificar de forma automática y repetible.
        </p>
        <h2>En qué trabajo</h2>
        <p>
          Suites de test end-to-end con Cypress y Gherkin, regresión visual de
          componentes, y el diseño de pipelines de CI que fallan por las razones
          correctas. Últimamente, en cómo cambia todo eso cuando parte del código lo
          escribe un agente.
        </p>
        <h2>Contacto</h2>
        <p>
          {/* TODO: sustituir por tus enlaces reales */}
          <a href="https://github.com/">GitHub</a> ·{' '}
          <a href="https://www.linkedin.com/">LinkedIn</a>
        </p>
      </Prose>
    </Stack>
  );
}

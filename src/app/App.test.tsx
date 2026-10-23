import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { createMissionState, missionReducer } from '../state/mission';
import { isoToJd } from '../domain/units';

const step = (name: string) => within(screen.getByRole('navigation', { name: 'Etapas da missão' })).getByRole('button', { name });

describe('interface', () => {
  it('abre no Centro de Missão e libera só as etapas de projeto', () => {
    render(<App />);
    expect(step('Hangar')).toBeEnabled();
    expect(step('Cruzeiro')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Iniciar missão' })).toBeInTheDocument();
  });

  it('no hangar, escolher um preset e uma peça incompatível aparece como problema', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar missão' }));
    const presets = screen.getByRole('group', { name: 'Configurações de referência' });
    fireEvent.click(within(presets).getByRole('button', { name: /541/ }));
    expect(within(presets).getByRole('button', { name: /541/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Coifa' }));
    const fairing = screen.getByRole('region', { name: 'Coifa' });
    fireEvent.click(within(fairing).getAllByRole('button').find((b) => /Falcon/i.test(b.textContent ?? ''))!);
    expect(screen.getByRole('list', { name: 'Problemas de compatibilidade' })).toHaveTextContent(/não é qualificada/);
  });

  it('a data escolhida no planejamento chega ao checklist', async () => {
    const initial = missionReducer(createMissionState(), { type: 'trajetoria', selection: { departureJd: isoToJd('2026-11-20'), tofDays: 300 } });
    render(<App initial={{ ...initial, phase: 'checklist' }} />);
    expect(screen.getByRole('list', { name: 'Itens do checklist' })).toHaveTextContent(/300 dias/);
  });

  it('lançamento forçado exige confirmação explícita', () => {
    const bad = missionReducer(createMissionState(), { type: 'veiculo', patch: { fairingId: 'falcon-5m' } });
    render(<App initial={{ ...bad, phase: 'checklist' }} />);
    expect(screen.getByRole('button', { name: 'Lançar' })).toBeDisabled();
    const forced = screen.getByRole('button', { name: 'Lançamento forçado' });
    expect(forced).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Entendo os riscos/ }));
    expect(forced).toBeEnabled();
  });

  it('lança, passa para o voo e trava as etapas de projeto', async () => {
    render(<App initial={{ ...createMissionState(), phase: 'checklist' }} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Lançar' })));
    expect(step('Hangar')).toBeDisabled();
    expect(step('Lançamento')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Pular para o fim da sequência' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Seguir para o cruzeiro' })));
    // Regressão: no instante da partida a sonda está no centro da Terra (distância zero no enlace).
    expect(screen.getByRole('heading', { name: 'Cruzeiro interplanetário' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Até o próximo evento' })));
    expect(screen.getByRole('button', { name: 'Executar correção' })).toBeInTheDocument();
  });

  it('Painel de Física alterna entre Simples e Avançado', () => {
    render(<App initial={{ ...createMissionState(), phase: 'hangar' }} />);
    const adv = screen.getAllByRole('button', { name: /Avançado/ })[0];
    fireEvent.click(adv);
    expect(adv).toHaveAttribute('aria-pressed', 'true');
  });

  it('planejamento mostra a seleção e permite trocar a órbita de captura', async () => {
    render(<App initial={{ ...createMissionState(), phase: 'planejamento' }} />);
    const radios = within(screen.getByRole('radiogroup', { name: 'Órbita de captura' })).getAllByRole('radio');
    fireEvent.click(radios[1]);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Tempo de voo (dias)')).toHaveValue(293);
  });
});

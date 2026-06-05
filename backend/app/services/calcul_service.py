"""Calculs pédagogiques purs — sans accès base de données."""

import uuid
from collections.abc import Sequence
from decimal import Decimal

from app.models.pedagogie import BulletinLigne, Note


class CalculService:
    """Moyennes, rangs et mentions."""

    @staticmethod
    def _to_decimal(value: Decimal | float | int) -> Decimal:
        return value if isinstance(value, Decimal) else Decimal(str(value))

    @staticmethod
    def calculer_moyenne_matiere(
        notes: Sequence[Note],
        coefficients: dict[uuid.UUID, Decimal] | None = None,
    ) -> float:
        """
        Moyenne d'une matière, pondérée par coefficient si fourni.

        Sans coefficients explicites, chaque note compte pour 1.
        """
        if not notes:
            return 0.0

        total_pondere = Decimal("0")
        total_coef = Decimal("0")
        for note in notes:
            coef = Decimal("1")
            if coefficients and note.matiere_id in coefficients:
                coef = CalculService._to_decimal(coefficients[note.matiere_id])
            total_pondere += CalculService._to_decimal(note.valeur) * coef
            total_coef += coef

        if total_coef == 0:
            return 0.0
        return float(total_pondere / total_coef)

    @staticmethod
    def calculer_moyenne_generale(lignes: Sequence[BulletinLigne]) -> float:
        """Moyenne générale pondérée par les coefficients des lignes."""
        if not lignes:
            return 0.0

        total_pondere = Decimal("0")
        total_coef = Decimal("0")
        for ligne in lignes:
            coef = CalculService._to_decimal(ligne.coefficient)
            total_pondere += CalculService._to_decimal(ligne.note) * coef
            total_coef += coef

        if total_coef == 0:
            return 0.0
        return float(total_pondere / total_coef)

    @staticmethod
    def calculer_rang(
        eleve_id: uuid.UUID,
        moyennes_par_eleve: dict[uuid.UUID, float],
    ) -> int:
        """Rang d'un élève dans sa classe (1 = meilleure moyenne)."""
        if eleve_id not in moyennes_par_eleve:
            return 0

        classement = sorted(
            moyennes_par_eleve.items(),
            key=lambda item: (-item[1], str(item[0])),
        )
        for rang, (eid, _) in enumerate(classement, start=1):
            if eid == eleve_id:
                return rang
        return 0

    @staticmethod
    def calculer_moyenne_classe(notes: Sequence[Note]) -> float:
        """Moyenne simple des notes d'une classe pour une matière."""
        if not notes:
            return 0.0
        total = sum(CalculService._to_decimal(n.valeur) for n in notes)
        return float(total / len(notes))

    @staticmethod
    def get_mention(moyenne: float) -> str:
        """Mention selon le barème malien standard."""
        if moyenne >= 16:
            return "Très Bien"
        if moyenne >= 14:
            return "Bien"
        if moyenne >= 12:
            return "Assez Bien"
        if moyenne >= 10:
            return "Passable"
        return "Insuffisant"

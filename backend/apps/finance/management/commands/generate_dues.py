from django.core.management.base import BaseCommand

from apps.finance.services import generate_dues


class Command(BaseCommand):
    help = "Génère les échéances des charges récurrentes (horizon 62 jours) et met à jour leurs statuts."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"{generate_dues()} échéance(s) créée(s)."))

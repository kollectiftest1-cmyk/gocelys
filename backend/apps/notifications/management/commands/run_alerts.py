from django.core.management.base import BaseCommand

from apps.notifications.services import run_alerts


class Command(BaseCommand):
    help = "Génère les alertes automatiques (stock, caisses, livraisons, transferts, échéances). À planifier toutes les 15 min."

    def handle(self, *args, **options):
        run_alerts()
        self.stdout.write(self.style.SUCCESS("Alertes générées."))

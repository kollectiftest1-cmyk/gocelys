from django.core.management.base import BaseCommand

from apps.inventory.services import rebuild_balances


class Command(BaseCommand):
    help = "Recalcule les soldes de stock à partir du registre des mouvements."

    def handle(self, *args, **options):
        n = rebuild_balances()
        self.stdout.write(self.style.SUCCESS(f"{n} soldes recalculés depuis le registre."))

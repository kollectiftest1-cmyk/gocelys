"""
Tests des règles de gestion essentielles (cahier des charges §36 et §39).

    python manage.py test apps
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.catalog import ROLE_PRESETS
from apps.accounts.models import Role, User, UserRole
from apps.agencies.models import Agency, DeliveryZone, PointOfSale
from apps.catalog.models import Category, Product, ProductUnit, Unit
from apps.core.api import BusinessError
from apps.core.models import AuditLog
from apps.delivery import services as delivery
from apps.delivery.models import Driver
from apps.finance import services as finance
from apps.finance.models import FinanceCategory, FinancialTransaction, PaymentMethod, RecurringCharge
from apps.inventory import services as stock
from apps.inventory.models import Bucket, MovementKind, StockBalance
from apps.orders import services as orders
from apps.orders.models import Address, Customer
from apps.sales import services as sales

D = Decimal


class GocelsysTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        for code, p in ROLE_PRESETS.items():
            Role.objects.create(code=code, name=p["name"], scope=p["scope"], permissions=p["permissions"], is_system=True)
        cls.mat = Agency.objects.create(code="MAT", name="Matadi", latitude=-5.81, longitude=13.45)
        cls.bom = Agency.objects.create(code="BOM", name="Boma", latitude=-5.85, longitude=13.05)
        cls.pos = PointOfSale.objects.create(agency=cls.mat, code="POS1", name="Caisse 1")
        cls.zone = DeliveryZone.objects.create(agency=cls.mat, name="Centre", fee=1500)
        bottle = Unit.objects.create(code="bouteille", name="Bouteille")
        carton = Unit.objects.create(code="carton", name="Carton")
        cat = Category.objects.create(name="Eau")
        cls.water = Product.objects.create(code="EB150", name="Eau 1,5 L", category=cat, base_unit=bottle, price=1500, min_stock=10)
        cls.unit = ProductUnit.objects.create(product=cls.water, unit=bottle, factor=1, price=1500)
        cls.carton = ProductUnit.objects.create(product=cls.water, unit=carton, factor=12, price=16500)
        cls.cash = PaymentMethod.objects.create(code="especes", name="Espèces", kind="cash")
        cls.mpesa = PaymentMethod.objects.create(code="mpesa", name="M-Pesa", kind="mobile_money")
        for code, direction in (("ventes", "in"), ("loyer", "out"), ("carburant", "out")):
            FinanceCategory.objects.create(code=code, name=code, direction=direction, is_expense=direction == "out")
        cls.admin = cls.user("admin", "admin")
        cls.cashier = cls.user("caisse", "cashier", cls.mat)
        cls.cashier.assigned_pos = cls.pos
        cls.cashier.save()
        cls.cashier_bom = cls.user("caisse.bom", "cashier", cls.bom)
        cls.manager = cls.user("resp", "agency_manager", cls.mat)
        cls.driver_user = cls.user("livreur", "driver", cls.mat)
        cls.driver = Driver.objects.create(user=cls.driver_user, agency=cls.mat)
        cls.customer = Customer.objects.create(name="Client", phone="+243820000000")
        cls.address = Address.objects.create(customer=cls.customer, line="Av. Test 1", zone=cls.zone, latitude=-5.81, longitude=13.45)

    @classmethod
    def user(cls, username, role, agency=None):
        u = User.objects.create_user(username=username, password="secret123", phone=f"+24381{abs(hash(username)) % 10**7:07d}")
        UserRole.objects.create(user=u, role=Role.objects.get(code=role), agency=agency)
        return u

    def put_stock(self, agency, qty):
        stock.record(agency=agency, product=self.water, bucket=Bucket.AVAILABLE, delta=qty, kind=MovementKind.INITIAL, reference="INIT")

    def qty(self, agency, bucket=Bucket.AVAILABLE):
        return stock.quantity(agency, self.water, bucket)


class StockRulesTests(GocelsysTestCase):
    def test_conversion_carton_uses_base_units(self):
        self.put_stock(self.mat, 100)
        session = sales.open_session(pos=self.pos, user=self.cashier, opening_float=0)
        sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.carton.pk, "quantity": 2}],
                          payments=[{"method": self.cash.pk, "amount": 33000}])
        self.assertEqual(self.qty(self.mat), 76)  # 100 − 2 × 12

    def test_insufficient_stock_is_refused_online(self):
        self.put_stock(self.mat, 3)
        session = sales.open_session(pos=self.pos, user=self.cashier)
        with self.assertRaises(BusinessError):
            sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 5}],
                              payments=[{"method": self.cash.pk, "amount": 7500}])
        self.assertEqual(self.qty(self.mat), 3)

    def test_manual_adjustment_keeps_history(self):
        self.put_stock(self.mat, 500)
        mv = stock.adjust(agency=self.mat, product=self.water, new_quantity=490, user=self.manager, reason="Comptage")
        self.assertEqual((mv.balance_before, mv.balance_after, mv.quantity), (500, 490, -10))
        with self.assertRaises(ValueError):
            mv.delete()
        self.assertTrue(AuditLog.objects.filter(action="stock.adjust").exists())

    def test_rebuild_matches_cached_balances(self):
        self.put_stock(self.mat, 50)
        stock.declare_loss(agency=self.mat, product=self.water, quantity=4, user=self.manager, reason="Casse", damaged=True)
        before = {(b.agency_id, b.bucket): b.quantity for b in StockBalance.objects.all()}
        stock.rebuild_balances()
        after = {(b.agency_id, b.bucket): b.quantity for b in StockBalance.objects.all()}
        self.assertEqual(before, after)
        self.assertEqual(self.qty(self.mat, Bucket.DAMAGED), 4)

    def test_transfer_never_counted_twice(self):
        self.put_stock(self.mat, 100)
        t = stock.create_transfer(source=self.mat, destination=self.bom, lines=[{"product": self.water, "quantity": 40}], user=self.manager)
        stock.validate_transfer(t, self.manager)
        stock.ship_transfer(t, self.manager)
        self.assertEqual(self.qty(self.mat), 60)
        self.assertEqual(self.qty(self.mat, Bucket.IN_TRANSIT), 40)
        self.assertEqual(self.qty(self.bom), 0)
        stock.receive_transfer(t, self.admin, damaged={self.water.pk: 2})
        self.assertEqual(self.qty(self.mat, Bucket.IN_TRANSIT), 0)
        self.assertEqual(self.qty(self.bom), 38)
        self.assertEqual(self.qty(self.bom, Bucket.DAMAGED), 2)

    def test_inventory_adjusts_gap(self):
        self.put_stock(self.mat, 500)
        inv = stock.start_inventory(agency=self.mat, user=self.manager, products=[self.water])
        line = inv.lines.get()
        line.counted = 490
        line.save()
        stock.submit_inventory(inv, self.manager)
        stock.validate_inventory(inv, self.manager)
        self.assertEqual(self.qty(self.mat), 490)


class CashAndSaleTests(GocelsysTestCase):
    def test_sale_requires_open_session(self):
        self.put_stock(self.mat, 10)
        session = sales.open_session(pos=self.pos, user=self.cashier)
        session = sales.close_session(session, user=self.cashier, counted_cash=0)
        with self.assertRaises(BusinessError):
            sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 1}],
                              payments=[{"method": self.cash.pk, "amount": 1500}])

    def test_cash_closing_difference(self):
        self.put_stock(self.mat, 100)
        session = sales.open_session(pos=self.pos, user=self.cashier, opening_float=50000)
        sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 3}],
                          payments=[{"method": self.cash.pk, "amount": 5000}])  # rendu 500
        sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 2}],
                          payments=[{"method": self.mpesa.pk, "amount": 3000, "reference": "MP1"}])
        figures = sales.session_figures(session)
        self.assertEqual(figures["expected_cash"], D("54500"))
        with self.assertRaises(BusinessError):
            sales.close_session(session, user=self.cashier, counted_cash=40000)
        closed = sales.close_session(session, user=self.cashier, counted_cash=40000, justification="Erreur de rendu")
        self.assertEqual(closed.difference, D("-14500"))

    def test_sale_idempotent_and_finance_entries(self):
        self.put_stock(self.mat, 10)
        session = sales.open_session(pos=self.pos, user=self.cashier)
        key = uuid.uuid4()
        args = dict(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 2}],
                    payments=[{"method": self.cash.pk, "amount": 3000}], client_uuid=key)
        sale, created = sales.create_sale(**args)
        again, created_again = sales.create_sale(**args)
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(sale.pk, again.pk)
        self.assertEqual(self.qty(self.mat), 8)
        self.assertEqual(FinancialTransaction.objects.filter(source="sale").count(), 1)

    def test_cancel_requires_permission_and_restores_stock(self):
        self.put_stock(self.mat, 10)
        session = sales.open_session(pos=self.pos, user=self.cashier)
        sale, _ = sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 4}],
                                    payments=[{"method": self.cash.pk, "amount": 6000}])
        with self.assertRaises(BusinessError):
            sales.cancel_sale(sale, user=self.cashier, reason="erreur")
        sales.cancel_sale(sale, user=self.manager, reason="Erreur de saisie")
        self.assertEqual(self.qty(self.mat), 10)

    def test_offline_sync_is_idempotent(self):
        self.put_stock(self.mat, 1)
        session_uuid = str(uuid.uuid4())
        now = timezone.now().isoformat()
        ops = [
            {"op_id": str(uuid.uuid4()), "type": "session.open", "occurred_at": now,
             "payload": {"pos": self.pos.pk, "opening_float": 20000, "session_uuid": session_uuid}},
            {"op_id": str(uuid.uuid4()), "type": "sale.create", "occurred_at": now,
             "payload": {"session_uuid": session_uuid, "client_uuid": str(uuid.uuid4()),
                         "lines": [{"product_unit": self.unit.pk, "quantity": 3}],
                         "payments": [{"method": "especes", "amount": 4500}], "offline_reference": "OFF-1"}},
        ]
        r1 = [sales.apply_operation(op, user=self.cashier, device_id="tab-1") for op in ops]
        r2 = [sales.apply_operation(op, user=self.cashier, device_id="tab-1") for op in ops]
        self.assertEqual([r["status"] for r in r1], ["applied", "applied"])
        self.assertEqual([r["status"] for r in r2], ["duplicate", "duplicate"])
        self.assertEqual(self.qty(self.mat), -2)  # vente hors ligne acceptée, stock négatif signalé


class OrderFlowTests(GocelsysTestCase):
    def test_reservation_and_delivery(self):
        self.put_stock(self.mat, 100)
        order = orders.place_order(customer=self.customer, lines=[{"product_unit": self.unit.pk, "quantity": 20}],
                                   fulfillment="delivery", requested_agency=self.mat, address=self.address, payment_method=self.cash)
        self.assertEqual(order.status, "confirmed")
        self.assertEqual(self.qty(self.mat), 80)
        self.assertEqual(self.qty(self.mat, Bucket.RESERVED), 20)
        self.assertEqual(order.total, D("31500"))  # 20 × 1500 + 1500 de livraison
        for s in ("accepted", "preparing", "ready"):
            order = orders.transition(order, s, user=self.manager)
        d = delivery.assign(order, self.driver, self.manager)
        delivery.driver_update(d, self.driver_user, "accepted")
        delivery.driver_update(d, self.driver_user, "picked_up")
        with self.assertRaises(BusinessError):
            delivery.confirm(d, self.driver_user, method="otp", otp="0000" if d.otp_code != "0000" else "1111")
        delivery.confirm(d, self.driver_user, method="otp", otp=d.otp_code)
        order.refresh_from_db()
        self.assertEqual(order.status, "completed")
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(self.qty(self.mat, Bucket.RESERVED), 0)
        self.assertEqual(self.qty(self.mat), 80)
        self.assertEqual(order.history.count(), 8)

    def test_cancel_releases_reservation(self):
        self.put_stock(self.mat, 30)
        order = orders.place_order(customer=self.customer, lines=[{"product_unit": self.unit.pk, "quantity": 10}],
                                   fulfillment="pickup", requested_agency=self.mat)
        orders.transition(order, "cancelled", user=None, by_customer=True)
        self.assertEqual(self.qty(self.mat), 30)
        self.assertEqual(self.qty(self.mat, Bucket.RESERVED), 0)

    def test_agency_fallback_when_chosen_is_out_of_stock(self):
        self.put_stock(self.bom, 50)
        order = orders.place_order(customer=self.customer, lines=[{"product_unit": self.unit.pk, "quantity": 5}],
                                   fulfillment="pickup", requested_agency=self.mat)
        self.assertEqual(order.agency, self.bom)

    def test_pickup_code(self):
        self.put_stock(self.mat, 30)
        order = orders.place_order(customer=self.customer, lines=[{"product_unit": self.unit.pk, "quantity": 1}],
                                   fulfillment="pickup", requested_agency=self.mat)
        for s in ("accepted", "preparing", "ready"):
            order = orders.transition(order, s, user=self.manager)
        with self.assertRaises(BusinessError):
            orders.complete_pickup(order, self.manager, "XXXX")
        orders.complete_pickup(order, self.manager, order.pickup_code)
        self.assertEqual(self.qty(self.mat, Bucket.RESERVED), 0)


class PosAssignmentTests(GocelsysTestCase):
    def test_cashier_opens_assigned_pos_without_choosing(self):
        self.assertEqual(sales.resolve_pos(self.cashier), self.pos)
        other = PointOfSale.objects.create(agency=self.mat, code="POS2", name="Caisse 2")
        with self.assertRaises(BusinessError):
            sales.resolve_pos(self.cashier, other)  # un caissier ne choisit pas sa caisse
        self.assertEqual(sales.resolve_pos(self.manager, other), other)  # un responsable peut remplacer

    def test_unassigned_cashier_is_refused(self):
        with self.assertRaises(BusinessError):
            sales.resolve_pos(self.cashier_bom)

    def test_default_float_used_when_not_given(self):
        self.pos.default_float = 30000
        self.pos.save()
        session = sales.open_session(pos=self.pos, user=self.cashier)
        self.assertEqual(session.opening_float, D("30000"))

    def test_open_via_api_without_pos(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"identifier": "caisse", "password": "secret123"}, format="json")
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        r = c.post("/api/cash-sessions/open/", {"opening_float": 10000}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["pos"], self.pos.pk)


class CatalogAdminTests(GocelsysTestCase):
    def test_category_and_unit_management_rights(self):
        direction = self.user("dir", "direction")
        for who, expected in ((self.admin, 201), (direction, 201), (self.manager, 403)):
            c = APIClient()
            r = c.post("/api/auth/login/", {"identifier": who.username, "password": "secret123"}, format="json")
            c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
            r = c.post("/api/units/", {"code": f"u-{who.username}", "name": "Fardeau"}, format="json")
            self.assertEqual(r.status_code, expected, (who.username, r.content))

    def test_used_unit_and_category_cannot_be_deleted(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"identifier": "admin", "password": "secret123"}, format="json")
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(c.delete(f"/api/units/{self.water.base_unit_id}/").status_code, 409)
        self.assertEqual(c.delete(f"/api/categories/{self.water.category_id}/").status_code, 409)

    def test_public_catalog_without_account(self):
        r = APIClient().get("/api/shop/catalog/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(APIClient().get("/api/public/home/").status_code, 200)


class FinanceTests(GocelsysTestCase):
    def test_recurring_monthly_dues(self):
        charge = RecurringCharge.objects.create(name="Loyer", category=FinanceCategory.objects.get(code="loyer"), amount=300,
                                                currency="USD", agency=self.mat, frequency="monthly",
                                                start_date=date(2026, 1, 1), due_day=30, end_date=date(2026, 4, 30))
        finance.generate_dues(charge=charge, horizon_days=3650)
        self.assertEqual([d.due_date for d in charge.dues.all()],
                         [date(2026, 1, 30), date(2026, 2, 28), date(2026, 3, 30), date(2026, 4, 30)])

    def test_big_expense_needs_approval(self):
        e = finance.create_expense(user=self.manager, data={
            "category": FinanceCategory.objects.get(code="carburant"), "amount": 500000, "currency": "CDF",
            "agency": self.mat, "reason": "Plein camion", "spent_on": timezone.localdate()})
        self.assertEqual(e.status, "pending")
        with self.assertRaises(BusinessError):
            finance.pay_expense(e, self.manager)
        finance.approve_expense(e, self.admin)
        finance.pay_expense(e, self.admin)
        self.assertEqual(FinancialTransaction.objects.filter(source="expense").count(), 1)


class AlertsTests(GocelsysTestCase):
    def test_run_alerts_and_low_stock(self):
        from apps.notifications.models import Notification
        from apps.notifications.services import run_alerts

        self.put_stock(self.mat, 5)  # sous le seuil de 10
        charge = RecurringCharge.objects.create(name="Loyer", category=FinanceCategory.objects.get(code="loyer"), amount=300,
                                                currency="USD", agency=self.mat, frequency="monthly",
                                                start_date=timezone.localdate() - timedelta(days=40), due_day=1)
        finance.generate_dues(charge=charge)
        run_alerts()
        self.assertTrue(Notification.objects.filter(kind="stock_low").exists())
        self.assertTrue(Notification.objects.filter(kind="due_overdue").exists())


class ApiPermissionTests(GocelsysTestCase):
    def client_for(self, user):
        c = APIClient()
        r = c.post("/api/auth/login/", {"identifier": user.username, "password": "secret123"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return c

    def test_cashier_cannot_see_finance(self):
        c = self.client_for(self.cashier)
        self.assertEqual(c.get("/api/finance/treasury/").status_code, 403)
        self.assertEqual(c.get("/api/dashboard/").status_code, 403)
        self.assertEqual(c.get("/api/auth/users/").status_code, 403)

    def test_agency_scoping(self):
        self.put_stock(self.mat, 10)
        session = sales.open_session(pos=self.pos, user=self.cashier)
        sales.create_sale(user=self.cashier, session=session, lines=[{"product_unit": self.unit.pk, "quantity": 1}],
                          payments=[{"method": self.cash.pk, "amount": 1500}])
        self.assertEqual(self.client_for(self.cashier).get("/api/sales/").data["count"], 1)
        self.assertEqual(self.client_for(self.cashier_bom).get("/api/sales/").data["count"], 0)
        self.assertEqual(self.client_for(self.admin).get("/api/sales/").data["count"], 1)

    def test_dashboard_for_admin(self):
        r = self.client_for(self.admin).get("/api/dashboard/?period=7d")
        self.assertEqual(r.status_code, 200)
        self.assertIn("kpis", r.data)

    def test_customer_shop_flow(self):
        self.put_stock(self.mat, 40)
        c = APIClient()
        r = c.post("/api/auth/register/", {"name": "Awa Ndaya", "phone": "0821112233", "password": "secret123"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(c.get("/api/shop/catalog/?agency=%d" % self.mat.pk).status_code, 200)
        r = c.post("/api/shop/orders/", {"lines": [{"product_unit": self.carton.pk, "quantity": 1}], "fulfillment": "pickup",
                                         "agency": self.mat.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["status"], "confirmed")
        self.assertEqual(c.get("/api/sales/").status_code, 403)

    def test_login_by_phone(self):
        r = APIClient().post("/api/auth/login/", {"identifier": self.cashier.phone, "password": "secret123"}, format="json")
        self.assertEqual(r.status_code, 200)


__all__ = ["timedelta"]


def _png(w, h, transparent):
    from io import BytesIO

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0) if transparent else (255, 255, 255, 255))
    ImageDraw.Draw(img).rectangle([w // 4, h // 8, w * 3 // 4, h * 7 // 8], fill=(34, 195, 230, 255))
    buf = BytesIO()
    img.save(buf, "PNG")
    return SimpleUploadedFile("produit.png", buf.getvalue(), content_type="image/png")


class SiteAndImagesTests(GocelsysTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from apps.catalog.defaults import create_default_slides
        from apps.catalog.models import ShowcaseSlide

        create_default_slides(ShowcaseSlide, Category)
        cls.direction = cls.user("dir", "direction")

    def setUp(self):
        import tempfile

        from django.test import override_settings

        self._media = tempfile.TemporaryDirectory()
        self._override = override_settings(MEDIA_ROOT=self._media.name)
        self._override.enable()

    def tearDown(self):
        self._override.disable()
        self._media.cleanup()

    def client_for(self, user):
        c = APIClient()
        r = c.post("/api/auth/login/", {"identifier": user.username, "password": "secret123"}, format="json")
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return c

    def test_product_photo_upload_detects_cutout_and_converts_to_webp(self):
        c = self.client_for(self.admin)
        r = c.post(f"/api/products/{self.water.pk}/image/", {"file": _png(900, 900, True)}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data["image_cutout"])
        self.assertTrue(r.data["image"].endswith(".webp"))
        from django.core.files.storage import default_storage

        first = Product.objects.get(pk=self.water.pk).image.name
        self.assertTrue(default_storage.exists(first))
        r = c.post(f"/api/products/{self.water.pk}/image/", {"file": _png(900, 900, False)}, format="multipart")
        self.assertFalse(r.data["image_cutout"])
        second = Product.objects.get(pk=self.water.pk).image.name
        self.assertTrue(default_storage.exists(second), "la nouvelle photo doit être conservée")
        self.assertFalse(default_storage.exists(first), "l'ancienne photo doit être supprimée")
        self.assertEqual(c.delete(f"/api/products/{self.water.pk}/image/").data["image"], None)
        self.assertFalse(default_storage.exists(second))

    def test_product_photo_rules(self):
        c = self.client_for(self.admin)
        r = c.post(f"/api/products/{self.water.pk}/image/", {"file": _png(300, 300, True)}, format="multipart")
        self.assertEqual(r.status_code, 409)
        self.assertIn("trop petite", str(r.data))
        self.assertEqual(self.client_for(self.cashier).post(
            f"/api/products/{self.water.pk}/image/", {"file": _png(900, 900, True)}, format="multipart").status_code, 403)

    def test_showcase_rights_and_public_payload(self):
        self.assertEqual(self.client_for(self.manager).get("/api/site/showcase/").status_code, 403)
        c = self.client_for(self.direction)
        self.assertEqual(len(c.get("/api/site/showcase/").data), 4)
        r = c.post("/api/site/showcase/", {"word": "Épicerie", "title": "Riz, sucre, huile.", "color": "#f2a01f", "model": "can"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["color"], "#F2A01F")
        home = APIClient().get("/api/public/home/").data
        self.assertEqual([s["word"] for s in home["showcase"]][-1], "Épicerie")

    def test_photo_model_needs_a_cutout_image(self):
        c = self.client_for(self.direction)
        base = {"word": "Riz", "title": "Riz parfumé", "color": "#C9A15A", "model": "photo"}
        self.assertEqual(c.post("/api/site/showcase/", base, format="json").status_code, 400)
        r = c.post("/api/site/showcase/", {**base, "upload": _png(800, 1000, False)}, format="multipart")
        self.assertEqual(r.status_code, 409)
        self.assertIn("détourée", str(r.data))
        r = c.post("/api/site/showcase/", {**base, "upload": _png(800, 1000, True)}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.data["image"].endswith(".webp"))
        from django.core.files.storage import default_storage

        from apps.catalog.models import ShowcaseSlide

        first = ShowcaseSlide.objects.get(pk=r.data["id"]).image.name
        r = c.patch(f"/api/site/showcase/{r.data['id']}/", {"upload": _png(800, 1200, True)}, format="multipart")
        second = ShowcaseSlide.objects.get(pk=r.data["id"]).image.name
        self.assertTrue(default_storage.exists(second))
        self.assertFalse(default_storage.exists(first))

    def test_showcase_keeps_one_active_slide(self):
        from apps.catalog.models import ShowcaseSlide

        c = self.client_for(self.admin)
        slides = list(ShowcaseSlide.objects.all())
        for s in slides[1:]:
            self.assertEqual(c.delete(f"/api/site/showcase/{s.pk}/").status_code, 204)
        self.assertEqual(c.delete(f"/api/site/showcase/{slides[0].pk}/").status_code, 409)
        self.assertEqual(c.patch(f"/api/site/showcase/{slides[0].pk}/", {"is_active": False}, format="json").status_code, 400)

    def test_featured_toggle(self):
        c = self.client_for(self.direction)
        r = c.post("/api/site/showcase/featured/", {"product": self.water.pk, "featured": True}, format="json")
        self.assertTrue(next(p for p in r.data["products"] if p["id"] == self.water.pk)["is_featured"])
        self.assertEqual(len(APIClient().get("/api/public/home/").data["featured"]), 1)

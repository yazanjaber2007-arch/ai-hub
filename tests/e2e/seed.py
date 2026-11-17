"""Seeds a throwaway test hub (see run-all.sh) with realistic data. Test secrets only: nothing here is real."""
import datetime as dt
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("HUB", "http://127.0.0.1:8801")
TOK = {
    "chief-of-staff": "tok-chief-of-staff-0123456789ab", "inbox": "tok-inbox-0123456789abcdef0123", "social": "tok-social-0123456789abcdef01",
    "fitness": "tok-fitness-0123456789abcdef0", "finance": "tok-finance-0123456789abcdef0",
}


def post(path, bot, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + TOK[bot], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"seed failed: {path} as {bot}: {e.code} {e.read().decode()[:200]}")


now = dt.datetime.now()
hh = lambda m: (now + dt.timedelta(minutes=m)).strftime("%H:%M")

post("/ingest/snapshot", "chief-of-staff", {"note": "3 meetings · 1 conflict", "tiles": [{"label": "Meetings today", "value": "3"}, {"label": "Conflicts", "value": "1", "trend": "down"}],
     "events": [{"at": hh(38), "title": "Reply to Sam (deadline)", "note": "inbox"}, {"at": hh(132), "title": "Investor call", "note": "conflicts with dentist"}],
     "priorities": ["Reply to Sam before the noon deadline", "Move the dentist: it clashes with the investor call"]})
post("/ingest/snapshot", "inbox", {"note": "12 unread · 2 urgent", "tiles": [{"label": "Unread", "value": "12", "trend": "down"}, {"label": "Urgent", "value": "2"}, {"label": "Awaiting reply", "value": "5"}],
     "priorities": ["Approve tomorrow's 3 posts"]})
post("/ingest/snapshot", "social", {"note": "3 posts queued", "tiles": [{"label": "Instagram views 7d", "value": "6,448", "trend": "up"}, {"label": "TikTok views 7d", "value": "2,544", "trend": "up"}, {"label": "Videos posted 7d", "value": "4"}]})
post("/ingest/snapshot", "fitness", {"note": "8,240 steps · 6d streak", "vitals": {"steps": 8240, "steps_goal": 10000, "sleep_hours": 7.2, "heart_rate": 62, "recovery": 78, "streak": 6}, "tiles": [{"label": "Workouts this week", "value": "3"}]})
post("/ingest/snapshot", "finance", {"note": "2 bills due soon", "finance": {"balance": "$18,420.55", "change_30d": "+$1,240.10", "series": [18100, 18250, 18420, 18300, 18650],
     "categories": [{"name": "Rent", "pct": 45}, {"name": "Business", "pct": 25}], "bills": [{"name": "Hosting Co", "amount": "$84.20", "due": (now + dt.timedelta(days=2)).strftime("%Y-%m-%d")}]},
     "events": [{"at": hh(20), "title": "Pay Hosting Co invoice", "note": "finance"}], "priorities": ["Pay the hosting invoice"], "tiles": [{"label": "Card balance owed", "value": "$2,008.83"}]})
post("/ingest/brief", "inbox", {"title": "2 urgent replies waiting", "body": "Sam (noon deadline) and the landlord", "kind": "alert", "priority": "high"})
post("/ingest/brief", "chief-of-staff", {"title": "Calendar conflict", "body": "Dentist 2 pm overlaps the investor call", "kind": "brief", "priority": "high"})
post("/ingest/brief", "social", {"title": "3 posts scheduled for tomorrow", "body": "Reach up 18% week on week", "kind": "brief", "priority": "normal"})
post("/ingest/brief", "finance", {"title": "Invoice from Hosting Co", "body": "$84.20 due in 2 days", "kind": "brief", "priority": "normal"})
post("/ingest/approvals", "social", {"title": "Post “Friday launch” to Instagram", "detail": "scheduled 12:00"})
post("/ingest/approvals", "finance", {"title": "Pay invoice to Hosting Co", "detail": "due in 2 days", "amount": "$84.20"})
post("/ingest/approvals", "inbox", {"title": "Send reply to Sam", "detail": "draft ready"})
print("seeded", BASE)

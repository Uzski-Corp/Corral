"""Startup migration policy: apply what this checkout knows; don't die on another branch's stamp."""

import pytest

from app.db.migrate import Action, _refuse, allow_unknown, decide


def test_fresh_database_upgrades() -> None:
    assert decide(None, {"0005_lead_crm"}) == (Action.UPGRADE, [])
    assert decide([], {"0005_lead_crm"}) == (Action.UPGRADE, [])


def test_known_revision_upgrades_to_head() -> None:
    known = {"0004_knowledge_base", "0005_lead_crm"}
    assert decide(["0004_knowledge_base"], known) == (Action.UPGRADE, [])


def test_revision_from_another_checkout_boots_without_rewriting_the_stamp() -> None:
    action, unknown = decide(["0007_keep_uploaded_picture"], {"0005_lead_crm"})
    assert action is Action.BOOT
    assert unknown == ["0007_keep_uploaded_picture"]


def test_only_local_may_boot_on_an_unknown_revision() -> None:
    assert allow_unknown(None) is True
    assert allow_unknown("") is True
    assert allow_unknown("local") is True
    assert allow_unknown("test") is False
    assert allow_unknown("staging") is False
    assert allow_unknown("production") is False


def test_deployed_env_refuses_an_unknown_revision(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as raised:
        _refuse(["0007_keep_uploaded_picture"])
    err = capsys.readouterr().err
    assert raised.value.code == 1
    assert "0007_keep_uploaded_picture" in err
    assert "Refusing to start" in err

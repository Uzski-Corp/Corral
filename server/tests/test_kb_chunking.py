"""Chunking properties: bounded size, nothing lost, locations kept, deterministic."""

import itertools

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.kb.chunking import chunk_sections
from app.kb.parsing import Section

words = st.text(alphabet="abcdefghij", min_size=1, max_size=12)
sentences = st.lists(words, min_size=1, max_size=30).map(lambda ws: " ".join(ws) + ".")
paragraphs = st.lists(sentences, min_size=1, max_size=8).map(" ".join)
texts = st.lists(paragraphs, min_size=1, max_size=6).map("\n\n".join)
sections = st.lists(
    st.builds(Section, st.one_of(st.none(), st.text(max_size=10)), texts), min_size=1, max_size=4
)


@settings(max_examples=150)
@given(sections, st.integers(min_value=20, max_value=400), st.data())
def test_chunks_are_bounded_ordered_and_located(
    secs: list[Section], size: int, data: st.DataObject
) -> None:
    overlap = data.draw(st.integers(min_value=0, max_value=size - 1))
    chunks = chunk_sections(secs, size=size, overlap=overlap)
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert all(0 < len(c.text) <= size for c in chunks)
    assert {c.loc for c in chunks} <= {s.loc for s in secs}
    assert chunks == chunk_sections(secs, size=size, overlap=overlap)  # deterministic


@settings(max_examples=150)
@given(sections, st.integers(min_value=20, max_value=400))
def test_without_overlap_every_word_appears_once_in_order(secs: list[Section], size: int) -> None:
    chunks = chunk_sections(secs, size=size, overlap=0)
    got = " ".join(c.text for c in chunks).split()
    assert got == " ".join(s.text for s in secs).split()


@settings(max_examples=100)
@given(texts, st.integers(min_value=40, max_value=300))
def test_overlap_repeats_the_end_of_the_previous_passage(text: str, size: int) -> None:
    overlap = size // 4
    chunks = chunk_sections([Section(None, text)], size=size, overlap=overlap)
    for prev, nxt in itertools.pairwise(chunks):
        head = nxt.text.split()[0]
        # The next passage starts either fresh or with words from the previous one's tail.
        assert head in prev.text.split() or head in text.split()


def test_sections_never_share_a_passage() -> None:
    chunks = chunk_sections(
        [Section("p.1", "alpha beta"), Section("p.2", "gamma delta")], size=100, overlap=10
    )
    assert [(c.loc, c.text) for c in chunks] == [("p.1", "alpha beta"), ("p.2", "gamma delta")]


def test_long_words_are_cut_to_the_limit() -> None:
    word = "x" * 250
    chunks = chunk_sections([Section(None, f"start {word} end")], size=100, overlap=0)
    assert all(len(c.text) <= 100 for c in chunks)
    assert "".join(c.text.replace(" ", "") for c in chunks) == f"start{word}end"


def test_paragraphs_are_packed_and_sentences_joined_with_spaces() -> None:
    text = "One. Two.\n\nThree.\n\n" + "Long sentence here. " * 20
    chunks = chunk_sections([Section(None, text)], size=80, overlap=0)
    assert chunks[0].text.startswith("One. Two.\n\nThree.")
    assert all("\n\n" not in c.text for c in chunks[1:])


def test_overlap_that_does_not_fit_is_dropped() -> None:
    chunks = chunk_sections([Section(None, "a" * 50 + "\n\n" + "b" * 60)], size=60, overlap=30)
    assert [c.text for c in chunks] == ["a" * 50, "b" * 60]


def test_empty_sections_make_no_passages() -> None:
    assert chunk_sections([Section(None, "  \n\n  ")], size=50, overlap=5) == []


@pytest.mark.parametrize(("size", "overlap"), [(0, 0), (10, 10), (10, -1)])
def test_invalid_sizes_are_rejected(size: int, overlap: int) -> None:
    with pytest.raises(ValueError, match="size"):
        chunk_sections([], size=size, overlap=overlap)


def test_hard_wrap_of_blank_text_yields_nothing() -> None:
    from app.kb.chunking import _hard_wrap

    assert list(_hard_wrap("   ", 5)) == []
    assert list(_hard_wrap("abcdefghij", 5)) == ["abcde", "fghij"]
